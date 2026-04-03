import sqlite3

conn = sqlite3.connect('portail.db')
try:
    conn.execute('ALTER TABLE users ADD COLUMN destinataire TEXT DEFAULT ""')
    conn.commit()
    print('✅ Colonne destinataire ajoutée !')
except Exception as e:
    print('Info:', e)
conn.close()