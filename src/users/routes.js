import { Router } from 'express';
import { requireLogin, requireRole } from '../auth/middleware.js';
import { formToken, oncePerForm } from '../forms.js';
import { checkNewPassword } from '../lib/passwords.js';
import { cleanText, parseWholeNumber } from '../lib/validate.js';
import { regenerateSession } from '../web.js';
import { changePassword, checkPassword, createEmployee } from './users.js';

export const GENDERS = ['Male', 'Female', 'Other'];
const MAX_SALARY = 99_999_999; // the Java app's number(8)

export function usersRouter({ pool }) {
  const router = Router();

  // "Add Employee" (admin). The admin sets a temporary password; the employee
  // must replace it at first login (the Java app made the password the ID).
  router.get('/employees/new', requireRole('admin'), (req, res) => {
    res.render('employees/new', { title: 'Add employee', genders: GENDERS, values: {}, errors: [], formToken: formToken() });
  });

  router.post('/employees', requireRole('admin'), async (req, res) => {
    const body = req.body ?? {};
    const token = formToken(body.formToken);
    const errors = [];
    const name = cleanText(body.name, { maxLength: 100 });
    if (!name) errors.push("Enter the employee's name (up to 100 characters).");
    const gender = GENDERS.includes(body.gender) ? body.gender : null;
    if (!gender) errors.push('Choose a gender.');
    const salary = parseWholeNumber(body.salary, { min: 0, max: MAX_SALARY });
    if (salary === null) errors.push(`Salary must be a whole number from 0 to ${MAX_SALARY}.`);
    const passwordProblem = checkNewPassword(body.password);
    if (passwordProblem) errors.push(`Temporary password: ${passwordProblem}`);

    if (errors.length > 0) {
      const values = { name: textOrEmpty(body.name), gender: textOrEmpty(body.gender), salary: textOrEmpty(body.salary) };
      return res.status(422).render('employees/new', {
        title: 'Add employee', genders: GENDERS, values, errors, formToken: token,
      });
    }
    // A double-click on Add must not create a second account with the same temporary password.
    const { result: employee } = await oncePerForm(pool, token, (client) => (
      createEmployee(client, { name, gender, salary, password: body.password })
    ));
    req.flash('success', `Employee ${employee.username} added. Tell ${employee.name} their ID (${employee.username}) and the temporary password; they must change it when they first log in.`);
    res.redirect('/employees/new');
  });

  // "Change Password" (everyone).
  router.get('/account/password', requireLogin, (req, res) => {
    res.render('account/password', { title: 'Change password', errors: [] });
  });

  router.post('/account/password', requireLogin, async (req, res) => {
    const body = req.body ?? {};
    const current = textOrEmpty(body.currentPassword);
    const next = body.newPassword;
    const errors = [];

    if (!(await checkPassword(pool, req.user.id, current))) {
      errors.push('Current password is wrong.');
    } else {
      const problem = checkNewPassword(next);
      if (problem) errors.push(problem);
      else if (next !== body.confirmPassword) errors.push('The new passwords do not match.');
      else if (next === current) errors.push('The new password must be different from the current one.');
    }

    if (errors.length > 0) {
      return res.status(422).render('account/password', { title: 'Change password', errors });
    }
    const passwordVersion = await changePassword(pool, req.user.id, next);
    // Other sessions of this account are now logged out (see loadUser); this one
    // continues under a new session ID, so a copied cookie stops working too.
    await regenerateSession(req);
    req.session.userId = req.user.id;
    req.session.passwordVersion = passwordVersion;
    req.flash('success', 'Password changed.');
    res.redirect('/');
  });

  return router;
}

function textOrEmpty(value) {
  return typeof value === 'string' ? value : '';
}
