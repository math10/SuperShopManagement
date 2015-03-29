/*
 * To change this template, choose Tools | Templates
 * and open the template in the editor.
 */
package shopmanagment;

import java.awt.Color;
import javax.swing.InputVerifier;
import javax.swing.JComponent;
import javax.swing.JTextField;

/**
 *
 * @author Faiaz,Sanim
 */
class IntegerNumberVarify extends InputVerifier {

        @Override
        public boolean verify(JComponent jc) {
            JTextField tmp = (JTextField) jc;
            try {
                int d = Integer.parseInt(tmp.getText().toString());
            } catch (Exception e) {
                tmp.setBackground(Color.RED);
                return false;
            } 
            tmp.setBackground(Color.WHITE);
            return true;
        }
    }
