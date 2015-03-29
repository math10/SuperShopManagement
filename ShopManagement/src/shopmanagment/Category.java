/*
 * To change this template, choose Tools | Templates
 * and open the template in the editor.
 */
package shopmanagment;

import java.beans.PropertyChangeListener;
import java.beans.PropertyChangeSupport;
import java.io.Serializable;
import javax.persistence.Basic;
import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.NamedQueries;
import javax.persistence.NamedQuery;
import javax.persistence.Table;
import javax.persistence.Transient;

/**
 *
 * @author Faiaz
 */
@Entity
@Table(name = "CATEGORY", catalog = "", schema = "SYSTEM")
@NamedQueries({
    @NamedQuery(name = "Category.findAll", query = "SELECT c FROM Category c"),
    @NamedQuery(name = "Category.findByCGory", query = "SELECT c FROM Category c WHERE c.cGory = :cGory")})
public class Category implements Serializable {
    @Transient
    private PropertyChangeSupport changeSupport = new PropertyChangeSupport(this);
    private static final long serialVersionUID = 1L;
    @Id
    @Basic(optional = false)
    @Column(name = "C_GORY")
    private String cGory;

    public Category() {
    }

    public Category(String cGory) {
        this.cGory = cGory;
    }

    public String getCGory() {
        return cGory;
    }

    public void setCGory(String cGory) {
        String oldCGory = this.cGory;
        this.cGory = cGory;
        changeSupport.firePropertyChange("CGory", oldCGory, cGory);
    }

    @Override
    public int hashCode() {
        int hash = 0;
        hash += (cGory != null ? cGory.hashCode() : 0);
        return hash;
    }

    @Override
    public boolean equals(Object object) {
        // TODO: Warning - this method won't work in the case the id fields are not set
        if (!(object instanceof Category)) {
            return false;
        }
        Category other = (Category) object;
        if ((this.cGory == null && other.cGory != null) || (this.cGory != null && !this.cGory.equals(other.cGory))) {
            return false;
        }
        return true;
    }

    @Override
    public String toString() {
        return "shopmanagment.Category[ cGory=" + cGory + " ]";
    }

    public void addPropertyChangeListener(PropertyChangeListener listener) {
        changeSupport.addPropertyChangeListener(listener);
    }

    public void removePropertyChangeListener(PropertyChangeListener listener) {
        changeSupport.removePropertyChangeListener(listener);
    }
    
}
