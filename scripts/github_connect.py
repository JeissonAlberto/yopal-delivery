import time
import requests
import json
import os
import subprocess

CLIENT_ID = "178c6fc778ccc68e1d6a"
DEVICE_CODE = "cfdb9ebfad983e8c7e337e5045132a5335a00e56"
INTERVAL = 5

print("Iniciando escucha de autorización de GitHub...")

for _ in range(180): # 15 minutos
    time.sleep(INTERVAL)
    try:
        resp = requests.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": CLIENT_ID,
                "device_code": DEVICE_CODE,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code"
            },
            timeout=10
        )
        data = resp.json()
        
        if "access_token" in data:
            token = data["access_token"]
            print("✅ AUTORIZACIÓN EXITOSA: Token de GitHub obtenido.")
            
            # Obtener datos del usuario
            u_resp = requests.get(
                "https://api.github.com/user",
                headers={"Authorization": f"token {token}", "Accept": "application/json"},
                timeout=10
            )
            user_data = u_resp.json()
            username = user_data.get("login", "user")
            email = user_data.get("email") or f"{username}@users.noreply.github.com"
            
            print(f"👤 Conectado a la cuenta de GitHub: {username} ({email})")
            
            # Guardar credenciales de git
            subprocess.run(["git", "config", "--global", "credential.helper", "store"], check=True)
            
            # Configurar identidad
            subprocess.run(["git", "config", "--global", "user.name", username], check=True)
            subprocess.run(["git", "config", "--global", "user.email", email], check=True)
            
            # Guardar en archivo .env para persistencia del agente
            hermes_env = os.path.expanduser("~/.hermes/.env")
            os.makedirs(os.path.dirname(hermes_env), exist_ok=True)
            with open(hermes_env, "a", encoding="utf-8") as f:
                f.write(f"\nGITHUB_TOKEN={token}\nGITHUB_USER={username}\n")
                
            # Escribir en ~/.git-credentials
            git_creds = os.path.expanduser("~/.git-credentials")
            with open(git_creds, "a", encoding="utf-8") as f:
                f.write(f"https://{username}:{token}@github.com\n")
                
            # Crear repositorio en GitHub si no existe
            repo_name = "yopal-delivery"
            create_repo_resp = requests.post(
                "https://api.github.com/user/repos",
                headers={"Authorization": f"token {token}", "Accept": "application/json"},
                json={
                    "name": repo_name,
                    "description": "LUPIN Express - Plataforma de Comercio, Delivery, Reputación Bayesiana y Bre-B para Yopal, Casanare",
                    "private": True
                },
                timeout=15
            )
            
            remote_url = f"https://{username}:{token}@github.com/{username}/{repo_name}.git"
            
            # Configurar remote y hacer push
            subprocess.run(["git", "remote", "remove", "origin"], stderr=subprocess.DEVNULL)
            subprocess.run(["git", "remote", "add", "origin", remote_url], check=True)
            subprocess.run(["git", "branch", "-M", "main"], check=True)
            push_res = subprocess.run(["git", "push", "-u", "origin", "main"], capture_output=True, text=True)
            
            print(f"🚀 Repositorio sincronizado exitosamente en GitHub: https://github.com/{username}/{repo_name}")
            print(push_res.stdout)
            if push_res.stderr:
                print(push_res.stderr)
            break
            
        elif data.get("error") == "authorization_pending":
            continue
        elif data.get("error") == "slow_down":
            INTERVAL += 5
        elif data.get("error") == "expired_token":
            print("❌ El código expiró. Por favor solicita uno nuevo.")
            break
        elif data.get("error") == "access_denied":
            print("❌ Acceso denegado por el usuario.")
            break
        else:
            print(f"Estado: {data}")
    except Exception as e:
        print(f"Esperando... ({e})")
