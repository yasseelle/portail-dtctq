from database import SessionLocal, engine, Base
import models, auth

Base.metadata.create_all(bind=engine)

db = SessionLocal()

existing = db.query(models.User).filter(models.User.matricule == "84488R").first()
if existing:
    print("✅ Admin already exists")
else:
    admin = models.User(
        nom_prenom = "JABBARI ILYASS",
        matricule  = "84488R",
        unite      = "DTC/TQ",
        role       = "admin",
        password   = auth.hash_password("admin1234"),
    )
    db.add(admin)
    db.commit()
    print("✅ Admin créé — matricule: 84488R  |  password: admin1234")

db.close()