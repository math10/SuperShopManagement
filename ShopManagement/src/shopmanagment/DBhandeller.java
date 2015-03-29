/*
 * To change this template, choose Tools | Templates
 * and open the template in the editor.
 */
package shopmanagment;


import java.sql.*;
import java.util.Properties;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 *
 * @author Faiaz
 */
public class DBhandeller {
    DBhandeller(){
        
    }
    public Connection getConnection() {
        Connection conn = null;
        try {
            Class.forName("oracle.jdbc.OracleDriver");
            String url = "jdbc:oracle:thin:@localhost:1521:XE";
            Properties props = new Properties();
            props.setProperty("user", "system");
            props.setProperty("password", "12345a");
            
            try {
                conn = DriverManager.getConnection(url,props);
            } catch (SQLException ex) {
                Logger.getLogger(DBhandeller.class.getName()).log(Level.SEVERE, null, ex);
            }
        } catch (ClassNotFoundException ex) {
            Logger.getLogger(DBhandeller.class.getName()).log(Level.SEVERE, null, ex);
        }
        return conn;
    }
}
