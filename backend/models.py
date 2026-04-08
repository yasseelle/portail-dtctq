from sqlalchemy import Column, Integer, String, DateTime, Text, JSON
from sqlalchemy.sql import func
from database import Base
from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, ForeignKey


class User(Base):
    __tablename__ = "users"
    id           = Column(Integer, primary_key=True, index=True)
    nom_prenom   = Column(String, nullable=False)
    matricule    = Column(String, unique=True, nullable=False)
    unite        = Column(String, nullable=False)
    destinataire = Column(String, default="")
    role         = Column(String, default="agent")
    password     = Column(String, nullable=False)
    created_at   = Column(DateTime, server_default=func.now())


class DocumentRH(Base):
    __tablename__ = "documents_rh"
    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, nullable=False)
    type_doc     = Column(String, nullable=False)
    metadata_doc = Column(JSON, nullable=False)
    created_at   = Column(DateTime, server_default=func.now())


class Courrier(Base):
    __tablename__ = "courrier"
    id            = Column(Integer, primary_key=True, index=True)
    expediteur    = Column(String, nullable=False)
    date_courrier = Column(String)
    objet         = Column(Text)
    pdf_path      = Column(String, default="")
    txt_path      = Column(String, default="")
    mois          = Column(String, default="")
    created_at    = Column(DateTime, server_default=func.now())


class Bordereau(Base):
    __tablename__ = "bordereau"
    id           = Column(Integer, primary_key=True, index=True)
    reference    = Column(String, default="")
    destinataire = Column(String, default="")
    objet        = Column(Text)
    pdf_path     = Column(String, default="")
    txt_path     = Column(String, default="")
    created_at   = Column(DateTime, server_default=func.now())


class CourrierDepart(Base):
    __tablename__ = "courrier_depart"
    id                 = Column(Integer, primary_key=True, index=True)
    reference          = Column(String, default="")
    date_depart        = Column(String)
    destinataire       = Column(String, default="")
    objet              = Column(Text)
    pdf_depart_path    = Column(String, default="")
    pdf_reception_path = Column(String, default="")
    date_reception     = Column(String, default="")
    mois               = Column(String, default="")
    created_at         = Column(DateTime, server_default=func.now())


class Notification(Base):
    """Une notification créée par un admin."""
    __tablename__ = "notifications"

    id         = Column(Integer, primary_key=True, index=True)
    titre      = Column(String, nullable=False)
    message    = Column(Text,   nullable=False)
    type_notif = Column(String, default="info")   # "urgent" | "todo" | "info"
    cible      = Column(String, default="all")    # "all" ou liste d'IDs séparés par virgule "1,3,7"
    created_by = Column(Integer, nullable=False)   # user_id de l'admin
    created_at = Column(DateTime, server_default=func.now())
    expires_at = Column(DateTime, nullable=True)


class NotificationRead(Base):
    """Marque qu'un agent a lu une notification."""
    __tablename__ = "notification_reads"

    id              = Column(Integer, primary_key=True, index=True)
    notification_id = Column(Integer, ForeignKey("notifications.id"), nullable=False)
    user_id         = Column(Integer, nullable=False)
    read_at         = Column(DateTime, server_default=func.now())

class Vehicule(Base):
    __tablename__ = "vehicules"

    id                  = Column(Integer, primary_key=True, index=True)
    numero_vehicule     = Column(String, nullable=False)        # N° véhicule interne
    matricule           = Column(String, nullable=False)        # Plaque d'immatriculation
    modele              = Column(String, nullable=False)        # Modèle (ex: Dacia Logan)
    service             = Column(String, default="")            # Service/unité
    derniere_visite     = Column(String, default="")            # Date DD/MM/YYYY
    prochaine_visite    = Column(String, default="")            # Date DD/MM/YYYY
    created_at          = Column(DateTime, server_default=func.now())
    updated_at          = Column(DateTime, server_default=func.now(), onupdate=func.now())


class VehiculeDocument(Base):
    __tablename__ = "vehicule_documents"

    id           = Column(Integer, primary_key=True, index=True)
    vehicule_id  = Column(Integer, ForeignKey("vehicules.id"), nullable=False)
    type_doc     = Column(String, nullable=False)   # carte_grise | visite_technique | assurance | vignette | autre
    nom_fichier  = Column(String, nullable=False)   # nom original
    chemin       = Column(String, nullable=False)   # chemin complet sur le disque
    uploaded_at  = Column(DateTime, server_default=func.now())


class Devis(Base):
    __tablename__ = "devis"
 
    id           = Column(Integer, primary_key=True, index=True)
    reference    = Column(String, default="")       # N° référence ex: 3/DI/CTR/DTC/TQ/SE/666/2024
    destinataire = Column(String, default="")       # ex: DCM/GC
    objet        = Column(Text,   default="")       # objet du devis
    montant_ttc  = Column(String, default="")       # montant total TTC ex: "1 590 915,17"
    pdf_path     = Column(String, default="")       # chemin complet du PDF
    date_devis   = Column(String, default="")       # date extraite du document DD/MM/YYYY
    mois         = Column(String, default="")       # feuille Excel ex: "Janvier"
    created_at   = Column(DateTime, server_default=func.now())
    updated_at   = Column(DateTime, server_default=func.now(), onupdate=func.now())