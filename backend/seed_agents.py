from database import SessionLocal, engine, Base
import models, auth

Base.metadata.create_all(bind=engine)
db = SessionLocal()

agents = [
    {"nom_prenom": "EZ-ZOUINE EL MOSTAFA", "matricule": "78402",   "unite": "DTC/TQ",    "destinataire": "M. BRAHIMI ALI",             "role": "admin"},
    {"nom_prenom": "LARHZIL FATIMA",        "matricule": "79661",   "unite": "DTC/TQ/SE", "destinataire": "M. EZZOUINE El Mostafa",      "role": "admin"},
    {"nom_prenom": "KAJAD MAHMOUD",         "matricule": "83258",   "unite": "DTC/TQ/SR", "destinataire": "M. EZZOUINE El Mostafa",      "role": "admin"},
    {"nom_prenom": "AOULTTUM Mohamed",      "matricule": "81367",   "unite": "DTC/TQ/SE", "destinataire": "MME. LARHZIL FATIMA",         "role": "agent"},
    {"nom_prenom": "BOUCETTA Youssef",      "matricule": "81431",   "unite": "DTC/TQ/SE", "destinataire": "MME. LARHZIL FATIMA",         "role": "agent"},
    {"nom_prenom": "CHAJAI AYOUB",          "matricule": "84606",   "unite": "DTC/TQ/SE", "destinataire": "MME. LARHZIL FATIMA",         "role": "agent"},
    {"nom_prenom": "EL AZZAB BOUCHRA",      "matricule": "85659C",  "unite": "DTC/TQ/SE", "destinataire": "MME. LARHZIL FATIMA",         "role": "agent"},
    {"nom_prenom": "HAMMAT Hayat",          "matricule": "80536",   "unite": "DTC/TQ/SE", "destinataire": "MME. LARHZIL FATIMA",         "role": "agent"},
    {"nom_prenom": "HOUBOB Khalid",         "matricule": "75537",   "unite": "DTC/TQ/SE", "destinataire": "MME. LARHZIL FATIMA",         "role": "agent"},
    {"nom_prenom": "KHALIL Mustapha",       "matricule": "74608",   "unite": "DTC/TQ/SE", "destinataire": "MME. LARHZIL FATIMA",         "role": "agent"},
    {"nom_prenom": "KHANAOUII EL MEHDI",    "matricule": "84818",   "unite": "DTC/TQ/SE", "destinataire": "MME. LARHZIL FATIMA",         "role": "agent"},
    {"nom_prenom": "MOUDKIRI AYOUB",        "matricule": "81125",   "unite": "DTC/TQ/SR", "destinataire": "M. KAJAD MAHMOUD",            "role": "agent"},
    {"nom_prenom": "MOUQTADIR Said",        "matricule": "74555",   "unite": "DTC/TQ/SE", "destinataire": "MME. LARHZIL FATIMA",         "role": "agent"},
    {"nom_prenom": "RAHALI ALI",            "matricule": "84352",   "unite": "DTC/TQ/SE", "destinataire": "MME. LARHZIL FATIMA",         "role": "agent"},
    {"nom_prenom": "JABBARI ILYASS",        "matricule": "84488R",  "unite": "DTC/TQ",    "destinataire": "M. EZZOUINE El Mostafa",      "role": "admin"},
    {"nom_prenom": "DERRICH El Mehdi",      "matricule": "81752",   "unite": "DTC/TQ/SR", "destinataire": "M. KAJAD MAHMOUD",            "role": "agent"},
    {"nom_prenom": "HACHLAF RACHID",        "matricule": "84833",   "unite": "DTC/TQ/SR", "destinataire": "M. KAJAD MAHMOUD",            "role": "agent"},
    {"nom_prenom": "LAMKHARTAT RIDA",       "matricule": "80792",   "unite": "DTC/TQ/SR", "destinataire": "M. KAJAD MAHMOUD",            "role": "agent"},
    {"nom_prenom": "LEMROUAJ Jilali",       "matricule": "74200",   "unite": "DTC/TQ/SR", "destinataire": "M. KAJAD MAHMOUD",            "role": "agent"},
    {"nom_prenom": "NAOUNI Mohammed",       "matricule": "80438",   "unite": "DTC/TQ/SR", "destinataire": "M. KAJAD MAHMOUD",            "role": "agent"},
    {"nom_prenom": "NAZIHI Abdlekrim",      "matricule": "77722",   "unite": "DTC/TQ/SR", "destinataire": "M. KAJAD MAHMOUD",            "role": "agent"},
    {"nom_prenom": "SADIKI Youness",        "matricule": "78987",   "unite": "DTC/TQ/SR", "destinataire": "M. KAJAD MAHMOUD",            "role": "agent"},
    {"nom_prenom": "SAIF Mohamed",          "matricule": "74210",   "unite": "DTC/TQ/SR", "destinataire": "M. KAJAD MAHMOUD",            "role": "agent"},
    {"nom_prenom": "TOUTI ZAHRA",           "matricule": "85263",   "unite": "DTC/TQ/SE", "destinataire": "MME. LARHZIL FATIMA",         "role": "agent"},
    {"nom_prenom": "ZOUBIR MOHAMED",        "matricule": "81907",   "unite": "DTC/TQ/SR", "destinataire": "M. KAJAD MAHMOUD",            "role": "agent"},
    {"nom_prenom": "MOUDKIRI HASSAN",       "matricule": "80609",   "unite": "DTC/TQ/SR", "destinataire": "M. KAJAD MAHMOUD",            "role": "agent"},
    {"nom_prenom": "EL KHAOUA Rachid",      "matricule": "75949",   "unite": "DTC/TQ/SR", "destinataire": "M. KAJAD MAHMOUD",            "role": "agent"},
    {"nom_prenom": "MIR NABIL",             "matricule": "85352",   "unite": "DTC/TQ/SE", "destinataire": "MME. LARHZIL FATIMA",         "role": "agent"},
    {"nom_prenom": "BENTALHA HAJAR",        "matricule": "81763",   "unite": "DTC/TQ/SE", "destinataire": "MME. LARHZIL FATIMA",         "role": "agent"},
    {"nom_prenom": "GHERMAH ALI",           "matricule": "85859",   "unite": "DTC/TQ/SR", "destinataire": "M. KAJAD MAHMOUD",            "role": "agent"},
]

created = 0
skipped = 0

for a in agents:
    existing = db.query(models.User).filter(
        models.User.matricule == a["matricule"]
    ).first()

    if existing:
        skipped += 1
        print(f"  ⏭️  Déjà existant : {a['nom_prenom']} ({a['matricule']})")
        continue

    # Default password = matricule (agent changes it on first login)
    user = models.User(
        nom_prenom   = a["nom_prenom"],
        matricule    = a["matricule"],
        unite        = a["unite"],
        destinataire = a.get("destinataire", ""),
        role         = a["role"],
        password     = auth.hash_password(a["matricule"]),  # password = matricule by default
    )
    db.add(user)
    created += 1
    role_badge = "👑 admin" if a["role"] == "admin" else "👤 agent"
    print(f"  ✅ Créé : {a['nom_prenom']:<30} | {a['matricule']:<10} | {role_badge}")

db.commit()
db.close()

print(f"\n{'='*55}")
print(f"  ✅ {created} agents créés")
print(f"  ⏭️  {skipped} déjà existants (ignorés)")
print(f"\n  🔑 Mot de passe par défaut = matricule de l'agent")
print(f"     Ex: CHAJAI AYOUB → password: 84606")
print(f"{'='*55}")
