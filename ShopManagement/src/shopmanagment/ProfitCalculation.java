/*
 * To change this template, choose Tools | Templates
 * and open the template in the editor.
 */
package shopmanagment;

import java.sql.CallableStatement;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.logging.Level;
import java.util.logging.Logger;
import oracle.jdbc.OracleTypes;

/**
 *
 * @author Faiaz,Sanim
 */
public class ProfitCalculation extends javax.swing.JFrame {

    /**
     * Creates new form ProfitCalculation
     */
    Connection conn;
    String sql;

    public ProfitCalculation() {
        try {
            initComponents();
            conn = new DBhandeller().getConnection();
            sql = ""
                    + " declare "
                    + "    a number(8,2); "
                    + "    b number(8);"
                    + " begin "
                    + "       select SUM(TRANSACTION.profit) into a from TRANSACTION;"
                    + "       select COUNT(TRANSACTION.id) into b from TRANSACTION;"
                    + " ? := a;"
                    + " ? := b;"
                    + " end; ";
            CallableStatement cs = conn.prepareCall(sql);
            cs.registerOutParameter(1, OracleTypes.DOUBLE);
            cs.registerOutParameter(2, OracleTypes.INTEGER);
            cs.execute();
            totPro.setText(String.valueOf(cs.getDouble(1)));
            totTran.setText(String.valueOf(cs.getInt(2)));
        } catch (SQLException ex) {
            Logger.getLogger(ProfitCalculation.class.getName()).log(Level.SEVERE, null, ex);
        }


    }

    /**
     * This method is called from within the constructor to initialize the form.
     * WARNING: Do NOT modify this code. The content of this method is always
     * regenerated by the Form Editor.
     */
    @SuppressWarnings("unchecked")
    // <editor-fold defaultstate="collapsed" desc="Generated Code">//GEN-BEGIN:initComponents
    private void initComponents() {

        timePre = new javax.swing.JComboBox();
        jLabel1 = new javax.swing.JLabel();
        jLabel2 = new javax.swing.JLabel();
        totTran = new javax.swing.JLabel();
        totPro = new javax.swing.JLabel();
        jButton1 = new javax.swing.JButton();

        setDefaultCloseOperation(javax.swing.WindowConstants.EXIT_ON_CLOSE);

        timePre.setModel(new javax.swing.DefaultComboBoxModel(new String[] { "All time", "Past 1week", "Past 1 month", "Past 1 year" }));
        timePre.addActionListener(new java.awt.event.ActionListener() {
            public void actionPerformed(java.awt.event.ActionEvent evt) {
                timePreActionPerformed(evt);
            }
        });

        jLabel1.setText("Number Of Transaction");

        jLabel2.setText("Total Profit");

        totTran.setText("jLabel3");

        totPro.setText("jLabel4");

        jButton1.setText("Back");
        jButton1.addActionListener(new java.awt.event.ActionListener() {
            public void actionPerformed(java.awt.event.ActionEvent evt) {
                jButton1ActionPerformed(evt);
            }
        });

        javax.swing.GroupLayout layout = new javax.swing.GroupLayout(getContentPane());
        getContentPane().setLayout(layout);
        layout.setHorizontalGroup(
            layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
            .addGroup(layout.createSequentialGroup()
                .addGroup(layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
                    .addGroup(layout.createSequentialGroup()
                        .addGap(157, 157, 157)
                        .addComponent(timePre, javax.swing.GroupLayout.PREFERRED_SIZE, javax.swing.GroupLayout.DEFAULT_SIZE, javax.swing.GroupLayout.PREFERRED_SIZE))
                    .addGroup(layout.createSequentialGroup()
                        .addGap(45, 45, 45)
                        .addGroup(layout.createParallelGroup(javax.swing.GroupLayout.Alignment.TRAILING)
                            .addComponent(jButton1)
                            .addGroup(layout.createSequentialGroup()
                                .addGroup(layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
                                    .addComponent(jLabel1)
                                    .addComponent(jLabel2))
                                .addGap(41, 41, 41)
                                .addGroup(layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
                                    .addComponent(totPro)
                                    .addComponent(totTran))))))
                .addContainerGap(155, Short.MAX_VALUE))
        );
        layout.setVerticalGroup(
            layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
            .addGroup(layout.createSequentialGroup()
                .addContainerGap()
                .addComponent(timePre, javax.swing.GroupLayout.PREFERRED_SIZE, javax.swing.GroupLayout.DEFAULT_SIZE, javax.swing.GroupLayout.PREFERRED_SIZE)
                .addGap(32, 32, 32)
                .addGroup(layout.createParallelGroup(javax.swing.GroupLayout.Alignment.BASELINE)
                    .addComponent(jLabel1)
                    .addComponent(totTran))
                .addGap(40, 40, 40)
                .addGroup(layout.createParallelGroup(javax.swing.GroupLayout.Alignment.BASELINE)
                    .addComponent(jLabel2)
                    .addComponent(totPro))
                .addPreferredGap(javax.swing.LayoutStyle.ComponentPlacement.RELATED, 89, Short.MAX_VALUE)
                .addComponent(jButton1)
                .addGap(57, 57, 57))
        );

        pack();
    }// </editor-fold>//GEN-END:initComponents

    private void timePreActionPerformed(java.awt.event.ActionEvent evt) {//GEN-FIRST:event_timePreActionPerformed
        // TODO add your handling code here:
        int id = timePre.getSelectedIndex();
        int day = (id == 1)?7:((id == 2)?30:365) ;
        
        if (id == 0) {
            try {
                sql = ""
                        + " declare "
                        + "    a number(8,2); "
                        + "    b number(8);"
                        + " begin "
                        + "       select SUM(TRANSACTION.profit) into a from TRANSACTION;"
                        + "       select COUNT(TRANSACTION.id) into b from TRANSACTION;"
                        + " ? := a;"
                        + " ? := b;"
                        + " end; ";
                CallableStatement cs = conn.prepareCall(sql);
                cs.registerOutParameter(1, OracleTypes.DOUBLE);
                cs.registerOutParameter(2, OracleTypes.INTEGER);
                cs.execute();
                totPro.setText(String.valueOf(cs.getDouble(1)));
                totTran.setText(String.valueOf(cs.getInt(2)));
            } catch (SQLException ex) {
                Logger.getLogger(ProfitCalculation.class.getName()).log(Level.SEVERE, null, ex);
            }
        } else {
            try {
                java.util.Date date = new java.util.Date();
                Timestamp t = new Timestamp(date.getTime() - (long)day * 1000 * 60 * 60 * 24);
                System.out.println(date);
                System.out.println(t);
                sql = ""
                        + " declare "
                        + "    a number(8,2); "
                        + "    b number(8);"
                        + "    c timestamp(6) := ?;"
                        + " begin "
                        + "       select SUM(TRANSACTION.profit) into a from TRANSACTION where TRANSACTION.id >= c;"
                        + "       select COUNT(TRANSACTION.id) into b from TRANSACTION where TRANSACTION.id >= c;"
                        + " ? := a;"
                        + " ? := b;"
                        + " end; ";
                CallableStatement cs = conn.prepareCall(sql);
                cs.setTimestamp(1, t);
                cs.registerOutParameter(2, OracleTypes.DOUBLE);
                cs.registerOutParameter(3, OracleTypes.INTEGER);
                cs.execute();
                totPro.setText(String.valueOf(cs.getDouble(2)));
                totTran.setText(String.valueOf(cs.getInt(3)));
            } catch (SQLException ex) {
                Logger.getLogger(ProfitCalculation.class.getName()).log(Level.SEVERE, null, ex);
            }
        }

    }//GEN-LAST:event_timePreActionPerformed

    private void jButton1ActionPerformed(java.awt.event.ActionEvent evt) {//GEN-FIRST:event_jButton1ActionPerformed
        // TODO add your handling code here:
        this.dispose();
        AdminPage p = new AdminPage();
        p.setVisible(true);
    }//GEN-LAST:event_jButton1ActionPerformed

    /**
     * @param args the command line arguments
     */
    public static void main(String args[]) {
        /* Set the Nimbus look and feel */
        //<editor-fold defaultstate="collapsed" desc=" Look and feel setting code (optional) ">
        /* If Nimbus (introduced in Java SE 6) is not available, stay with the default look and feel.
         * For details see http://download.oracle.com/javase/tutorial/uiswing/lookandfeel/plaf.html 
         */
        try {
            for (javax.swing.UIManager.LookAndFeelInfo info : javax.swing.UIManager.getInstalledLookAndFeels()) {
                if ("Nimbus".equals(info.getName())) {
                    javax.swing.UIManager.setLookAndFeel(info.getClassName());
                    break;
                }
            }
        } catch (ClassNotFoundException ex) {
            java.util.logging.Logger.getLogger(ProfitCalculation.class.getName()).log(java.util.logging.Level.SEVERE, null, ex);
        } catch (InstantiationException ex) {
            java.util.logging.Logger.getLogger(ProfitCalculation.class.getName()).log(java.util.logging.Level.SEVERE, null, ex);
        } catch (IllegalAccessException ex) {
            java.util.logging.Logger.getLogger(ProfitCalculation.class.getName()).log(java.util.logging.Level.SEVERE, null, ex);
        } catch (javax.swing.UnsupportedLookAndFeelException ex) {
            java.util.logging.Logger.getLogger(ProfitCalculation.class.getName()).log(java.util.logging.Level.SEVERE, null, ex);
        }
        //</editor-fold>

        /* Create and display the form */
        java.awt.EventQueue.invokeLater(new Runnable() {
            public void run() {
                new ProfitCalculation().setVisible(true);
            }
        });
    }
    // Variables declaration - do not modify//GEN-BEGIN:variables
    private javax.swing.JButton jButton1;
    private javax.swing.JLabel jLabel1;
    private javax.swing.JLabel jLabel2;
    private javax.swing.JComboBox timePre;
    private javax.swing.JLabel totPro;
    private javax.swing.JLabel totTran;
    // End of variables declaration//GEN-END:variables
}
