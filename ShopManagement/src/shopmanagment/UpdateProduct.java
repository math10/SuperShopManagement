/*
 * To change this template, choose Tools | Templates
 * and open the template in the editor.
 */
package shopmanagment;

import java.awt.event.ActionListener;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Vector;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 *
 * @author Faiaz,Sanim
 */
public class UpdateProduct extends javax.swing.JFrame {

    /**
     * Creates new form UpdateProduct
     */
    Connection conn;
    PreparedStatement preStatment;
    ResultSet result;
    String sql;
    ArrayList<Product> V;
    boolean flag,flag1;
    void addName() {
        if(flag) return;
        flag1 = true;
        V.clear();
        name.removeAllItems();
        String cur = category.getSelectedItem().toString();
        sql = "select * from product where product.category='" + cur + "' order by product.name";
        try {
            preStatment = conn.prepareStatement(sql);
            result = preStatment.executeQuery();
            while (result.next()) {
                try {
                    String a, b, c, d;
                    a = result.getString("name");
                    b = result.getString("buyingprice");
                    c = result.getString("sellingprice");
                    d = result.getString("available");
                   
                    name.addItem(a);
                    V.add(new Product(a, b, c, d));
                } catch (SQLException ex) {
                    Logger.getLogger(ShopManagment.class.getName()).log(Level.SEVERE, null, ex);
                }
            }
        } catch (Exception e) {
        }
        if (V.size() > 0) {
            costPrice.setText(V.get(0).costPrice);
            sellingPrice.setText(V.get(0).sellingPrice);
            preAble.setText(V.get(0).abaiable);
            avaiable.setText("0");
        } else {
            costPrice.setText("");
            sellingPrice.setText("");
            preAble.setText("");
            avaiable.setText("");
        }
        flag1 = false;
                    
    }

    void changeState() {
        if(flag1) return; 
        int id = name.getSelectedIndex();
        costPrice.setText(V.get(id).costPrice);
        sellingPrice.setText(V.get(id).sellingPrice);
        preAble.setText(V.get(id).abaiable);
        avaiable.setText("0");
        
    }

    public UpdateProduct() {
        initComponents();
        V = new ArrayList<>();
        flag = true;
        try {
            category.removeAllItems();
            conn = new DBhandeller().getConnection();
            sql = "select c_gory from category order by c_gory";
            preStatment = conn.prepareStatement(sql);
            result = preStatment.executeQuery();
            while (result.next()) {
                try {
                    category.addItem(result.getString("c_gory"));
                } catch (SQLException ex) {
                    Logger.getLogger(ShopManagment.class.getName()).log(Level.SEVERE, null, ex);
                }
            }
        } catch (SQLException ex) {
            Logger.getLogger(UpdateProduct.class.getName()).log(Level.SEVERE, null, ex);
        }

        costPrice.setInputVerifier(new doubleNumberVarify());
        sellingPrice.setInputVerifier(new doubleNumberVarify());
        avaiable.setInputVerifier(new IntegerNumberVarify());
        flag = false;
        addName();

    }        
    
    /**
     * This method is called from within the constructor to initialize the form.
     * WARNING: Do NOT modify this code. The content of this method is always
     * regenerated by the Form Editor.
     */
    @SuppressWarnings("unchecked")
    // <editor-fold defaultstate="collapsed" desc="Generated Code">//GEN-BEGIN:initComponents
    private void initComponents() {

        jLabel3 = new javax.swing.JLabel();
        jLabel2 = new javax.swing.JLabel();
        jLabel1 = new javax.swing.JLabel();
        jLabel4 = new javax.swing.JLabel();
        jLabel5 = new javax.swing.JLabel();
        costPrice = new javax.swing.JTextField();
        sellingPrice = new javax.swing.JTextField();
        avaiable = new javax.swing.JTextField();
        update = new javax.swing.JButton();
        category = new javax.swing.JComboBox();
        name = new javax.swing.JComboBox();
        preAble = new javax.swing.JLabel();
        jLabel7 = new javax.swing.JLabel();
        jButton1 = new javax.swing.JButton();

        setDefaultCloseOperation(javax.swing.WindowConstants.EXIT_ON_CLOSE);

        jLabel3.setText("Cost Price");

        jLabel2.setText("Name");

        jLabel1.setText("Category");

        jLabel4.setText("Selling Price");

        jLabel5.setText("Avaiable");

        costPrice.addActionListener(new java.awt.event.ActionListener() {
            public void actionPerformed(java.awt.event.ActionEvent evt) {
                costPriceActionPerformed(evt);
            }
        });

        update.setText("Update");
        update.addActionListener(new java.awt.event.ActionListener() {
            public void actionPerformed(java.awt.event.ActionEvent evt) {
                updateActionPerformed(evt);
            }
        });

        category.setModel(new javax.swing.DefaultComboBoxModel(new String[] { "Item 1", "Item 2", "Item 3", "Item 4" }));
        category.addActionListener(new java.awt.event.ActionListener() {
            public void actionPerformed(java.awt.event.ActionEvent evt) {
                categoryActionPerformed(evt);
            }
        });

        name.setModel(new javax.swing.DefaultComboBoxModel(new String[] { "Item 1", "Item 2", "Item 3", "Item 4" }));
        name.addActionListener(new java.awt.event.ActionListener() {
            public void actionPerformed(java.awt.event.ActionEvent evt) {
                nameActionPerformed(evt);
            }
        });

        preAble.setText("jLabel6");

        jLabel7.setText("+");

        jButton1.setText("cancel");
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
                .addGap(37, 37, 37)
                .addGroup(layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING, false)
                    .addGroup(layout.createSequentialGroup()
                        .addGroup(layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
                            .addComponent(jLabel1)
                            .addComponent(jLabel2)
                            .addComponent(jLabel3))
                        .addGap(26, 26, 26)
                        .addGroup(layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING, false)
                            .addComponent(costPrice, javax.swing.GroupLayout.DEFAULT_SIZE, 195, Short.MAX_VALUE)
                            .addComponent(name, 0, javax.swing.GroupLayout.DEFAULT_SIZE, Short.MAX_VALUE)
                            .addComponent(category, 0, javax.swing.GroupLayout.DEFAULT_SIZE, Short.MAX_VALUE)))
                    .addGroup(layout.createSequentialGroup()
                        .addGroup(layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
                            .addComponent(jLabel4)
                            .addComponent(jLabel5))
                        .addGap(18, 18, 18)
                        .addGroup(layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
                            .addComponent(sellingPrice)
                            .addGroup(layout.createSequentialGroup()
                                .addComponent(update, javax.swing.GroupLayout.PREFERRED_SIZE, 72, javax.swing.GroupLayout.PREFERRED_SIZE)
                                .addPreferredGap(javax.swing.LayoutStyle.ComponentPlacement.RELATED, javax.swing.GroupLayout.DEFAULT_SIZE, Short.MAX_VALUE)
                                .addComponent(jButton1))
                            .addGroup(javax.swing.GroupLayout.Alignment.TRAILING, layout.createSequentialGroup()
                                .addComponent(preAble)
                                .addPreferredGap(javax.swing.LayoutStyle.ComponentPlacement.RELATED, 27, Short.MAX_VALUE)
                                .addComponent(jLabel7, javax.swing.GroupLayout.PREFERRED_SIZE, 34, javax.swing.GroupLayout.PREFERRED_SIZE)
                                .addGap(18, 18, 18)
                                .addComponent(avaiable, javax.swing.GroupLayout.PREFERRED_SIZE, 82, javax.swing.GroupLayout.PREFERRED_SIZE)))))
                .addContainerGap(94, Short.MAX_VALUE))
        );
        layout.setVerticalGroup(
            layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
            .addGroup(layout.createSequentialGroup()
                .addGap(39, 39, 39)
                .addGroup(layout.createParallelGroup(javax.swing.GroupLayout.Alignment.BASELINE)
                    .addComponent(jLabel1)
                    .addComponent(category, javax.swing.GroupLayout.PREFERRED_SIZE, javax.swing.GroupLayout.DEFAULT_SIZE, javax.swing.GroupLayout.PREFERRED_SIZE))
                .addGap(18, 18, 18)
                .addGroup(layout.createParallelGroup(javax.swing.GroupLayout.Alignment.BASELINE)
                    .addComponent(jLabel2)
                    .addComponent(name, javax.swing.GroupLayout.PREFERRED_SIZE, javax.swing.GroupLayout.DEFAULT_SIZE, javax.swing.GroupLayout.PREFERRED_SIZE))
                .addGap(0, 20, Short.MAX_VALUE)
                .addGroup(layout.createParallelGroup(javax.swing.GroupLayout.Alignment.LEADING)
                    .addComponent(jLabel3)
                    .addComponent(costPrice, javax.swing.GroupLayout.PREFERRED_SIZE, javax.swing.GroupLayout.DEFAULT_SIZE, javax.swing.GroupLayout.PREFERRED_SIZE))
                .addGap(18, 18, 18)
                .addGroup(layout.createParallelGroup(javax.swing.GroupLayout.Alignment.BASELINE)
                    .addComponent(jLabel4)
                    .addComponent(sellingPrice, javax.swing.GroupLayout.PREFERRED_SIZE, javax.swing.GroupLayout.DEFAULT_SIZE, javax.swing.GroupLayout.PREFERRED_SIZE))
                .addGap(18, 18, 18)
                .addGroup(layout.createParallelGroup(javax.swing.GroupLayout.Alignment.BASELINE)
                    .addComponent(jLabel5)
                    .addComponent(avaiable, javax.swing.GroupLayout.PREFERRED_SIZE, javax.swing.GroupLayout.DEFAULT_SIZE, javax.swing.GroupLayout.PREFERRED_SIZE)
                    .addComponent(preAble)
                    .addComponent(jLabel7))
                .addGap(31, 31, 31)
                .addGroup(layout.createParallelGroup(javax.swing.GroupLayout.Alignment.BASELINE)
                    .addComponent(update)
                    .addComponent(jButton1))
                .addContainerGap(33, Short.MAX_VALUE))
        );

        pack();
    }// </editor-fold>//GEN-END:initComponents

    private void costPriceActionPerformed(java.awt.event.ActionEvent evt) {//GEN-FIRST:event_costPriceActionPerformed
        // TODO add your handling code here:
    }//GEN-LAST:event_costPriceActionPerformed

    private void updateActionPerformed(java.awt.event.ActionEvent evt) {//GEN-FIRST:event_updateActionPerformed
        try {
            // TODO add your handling code here:
            String cgory, nme, cPrice, sPrice;
            int able,pre;
            cgory = category.getSelectedItem().toString();
            nme = name.getSelectedItem().toString();
            cPrice = costPrice.getText();
            sPrice = sellingPrice.getText();
            pre = Integer.valueOf(preAble.getText());
            able = Integer.valueOf(avaiable.getText());
            pre += able;
            sql = "update product set buyingprice='"+cPrice+"',sellingPrice='"+sPrice+"',available='"+String.valueOf(pre)+"'"
                    + " where category='"+cgory+"' and name='"+nme+"'" ;
            System.out.println(sql);
            preStatment = conn.prepareStatement(sql);
            result = preStatment.executeQuery();
                
            
            back();
        } catch (SQLException ex) {
            Logger.getLogger(UpdateProduct.class.getName()).log(Level.SEVERE, null, ex);
        }
    }//GEN-LAST:event_updateActionPerformed

    private void categoryActionPerformed(java.awt.event.ActionEvent evt) {//GEN-FIRST:event_categoryActionPerformed
        // TODO add your handling code here:
        addName();
    }//GEN-LAST:event_categoryActionPerformed

    private void nameActionPerformed(java.awt.event.ActionEvent evt) {//GEN-FIRST:event_nameActionPerformed
        // TODO add your handling code here:
        changeState();
    }//GEN-LAST:event_nameActionPerformed

    private void jButton1ActionPerformed(java.awt.event.ActionEvent evt) {//GEN-FIRST:event_jButton1ActionPerformed
        // TODO add your handling code here:
        back();
    }//GEN-LAST:event_jButton1ActionPerformed

    void back() {
        ProductManagemnt p = new ProductManagemnt();
        this.dispose();
        p.setVisible(true);
    }

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
            java.util.logging.Logger.getLogger(UpdateProduct.class.getName()).log(java.util.logging.Level.SEVERE, null, ex);
        } catch (InstantiationException ex) {
            java.util.logging.Logger.getLogger(UpdateProduct.class.getName()).log(java.util.logging.Level.SEVERE, null, ex);
        } catch (IllegalAccessException ex) {
            java.util.logging.Logger.getLogger(UpdateProduct.class.getName()).log(java.util.logging.Level.SEVERE, null, ex);
        } catch (javax.swing.UnsupportedLookAndFeelException ex) {
            java.util.logging.Logger.getLogger(UpdateProduct.class.getName()).log(java.util.logging.Level.SEVERE, null, ex);
        }
        //</editor-fold>

        /* Create and display the form */
        java.awt.EventQueue.invokeLater(new Runnable() {
            public void run() {
                new UpdateProduct().setVisible(true);
            }
        });
    }
    // Variables declaration - do not modify//GEN-BEGIN:variables
    private javax.swing.JTextField avaiable;
    private javax.swing.JComboBox category;
    private javax.swing.JTextField costPrice;
    private javax.swing.JButton jButton1;
    private javax.swing.JLabel jLabel1;
    private javax.swing.JLabel jLabel2;
    private javax.swing.JLabel jLabel3;
    private javax.swing.JLabel jLabel4;
    private javax.swing.JLabel jLabel5;
    private javax.swing.JLabel jLabel7;
    private javax.swing.JComboBox name;
    private javax.swing.JLabel preAble;
    private javax.swing.JTextField sellingPrice;
    private javax.swing.JButton update;
    // End of variables declaration//GEN-END:variables
}