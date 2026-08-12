
import argparse
import json
import os
import sys
import threading
import time
import traceback
import urllib.error
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
except Exception:
    pass

try:
    import mujoco
    import mujoco.viewer
except ImportError:
    print("")
    print("  Este script precisa do MuJoCo, que nao esta instalado aqui:")
    print("      pip install mujoco")
    print("")
    print("  (o painel no navegador NAO precisa dele: python cinematica.py)")
    sys.exit(1)

import numpy as np

PERNAS = ["FL", "FR", "RL", "RR"]
Z_BASE = 0.55
HOME = [0.0, 0.9, -1.5]
VELVET = np.array([0.80, 0.07, 0.20, 1.0])

_RAW = ("https://raw.githubusercontent.com/google-deepmind/"
        "mujoco_menagerie/main/unitree_go2")

_ARQUIVOS = [
    "go2.xml",
    "assets/base_0.obj", "assets/base_1.obj", "assets/base_2.obj",
    "assets/base_3.obj", "assets/base_4.obj",
    "assets/hip_0.obj", "assets/hip_1.obj",
    "assets/thigh_0.obj", "assets/thigh_1.obj",
    "assets/thigh_mirror_0.obj", "assets/thigh_mirror_1.obj",
    "assets/calf_0.obj", "assets/calf_1.obj",
    "assets/calf_mirror_0.obj", "assets/calf_mirror_1.obj",
    "assets/foot.obj",
]

AQUI = os.path.dirname(os.path.abspath(__file__))

def _candidatos():
    lar = os.path.expanduser("~")
    return [
        os.path.join(AQUI, "modelo_go2", "unitree_go2"),
        os.path.join(lar, "Downloads", "go2_cinematica_ws", "unitree_go2"),
        os.path.join(os.getcwd(), "go2_cinematica_ws", "unitree_go2"),
    ]

def achar_ou_baixar():
    for pasta in _candidatos():
        if os.path.isfile(os.path.join(pasta, "go2.xml")):
            print("  modelo ..... %s" % pasta)
            return pasta

    base = os.path.join(AQUI, "modelo_go2", "unitree_go2")
    os.makedirs(os.path.join(base, "assets"), exist_ok=True)
    print("  modelo ..... baixando %d arquivos do mujoco_menagerie"
          " (so' desta vez)" % len(_ARQUIVOS))
    for rel in _ARQUIVOS:
        alvo = os.path.join(base, rel.replace("/", os.sep))
        if os.path.exists(alvo) and os.path.getsize(alvo) > 0:
            continue
        for tentativa in range(3):
            try:
                urllib.request.urlretrieve("%s/%s" % (_RAW, rel), alvo)
                break
            except Exception as e:
                if tentativa == 2:
                    raise RuntimeError(
                        "nao consegui baixar %s (%s).\n  Copie a pasta "
                        "unitree_go2 do mujoco_menagerie para %s" % (rel, e, base))
                time.sleep(0.5)
    print("  modelo ..... pronto em %s" % base)
    return base

_ALT_POSTE = max(Z_BASE - 0.03, 0.05)

_CENA = """<mujoco model="go2 bancada">
  <include file="go2.xml"/>

  <statistic center="0 0 0.4" extent="2.4"/>

  <visual>
    <headlight diffuse="0.52 0.48 0.50" ambient="0.30 0.26 0.28" specular="0.10 0.08 0.09"/>
    <rgba haze="0.05 0.03 0.04 1"/>
    <global azimuth="140" elevation="-16"/>
    <map znear="0.01"/>
  </visual>

  <asset>
    <texture type="skybox" builtin="gradient" rgb1="0.051 0.027 0.035"
             rgb2="0.13 0.09 0.10" width="256" height="256"/>
    <texture type="2d" name="chao" builtin="checker" mark="edge"
             rgb1="0.055 0.031 0.039" rgb2="0.090 0.055 0.065"
             markrgb="0.30 0.10 0.15" width="300" height="300"/>
    <material name="chao" texture="chao" texuniform="true"
              texrepeat="10 10" reflectance="0.10" shininess="0.30"/>
    <material name="suporte" rgba="0.11 0.08 0.09 1" reflectance="0.18"
              shininess="0.40"/>
  </asset>

  <worldbody>
    <light pos="0 0 4" dir="0 0 -1" directional="true"/>
    <light pos="2 -2 3" dir="-1 1 -1" directional="false" diffuse="0.20 0.17 0.18"/>
    <geom name="floor" type="plane" size="0 0 0.05" material="chao"/>

    <geom name="suporte_base" type="cylinder" size="0.13 0.016" pos="0 0 0.016"
          material="suporte"/>
    <geom name="suporte_poste" type="cylinder" size="0.045 {meio:.4f}"
          pos="0 0 {centro:.4f}" material="suporte"/>
    <geom name="suporte_prato" type="box" size="0.11 0.075 0.014"
          pos="0 0 {prato:.4f}" material="suporte"/>
  </worldbody>
</mujoco>
""".format(meio=_ALT_POSTE / 2, centro=0.032 + _ALT_POSTE / 2, prato=Z_BASE - 0.014)

def montar_cena(pasta):
    caminho = os.path.join(pasta, "cena_bancada.xml")
    with open(caminho, "w", encoding="utf-8") as fp:
        fp.write(_CENA)
    return caminho

def geoms_por_perna(m):
    grupos = {p: [] for p in PERNAS}
    for gid in range(m.ngeom):
        if m.geom_group[gid] != 2:
            continue
        nome = mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_BODY, m.geom_bodyid[gid]) or ""
        for p in PERNAS:
            if nome.startswith(p + "_"):
                grupos[p].append(gid)
                break
    return grupos

class Assinante(threading.Thread):
    def __init__(self, url, parar):
        super().__init__(daemon=True, name="assinante")
        self.url, self.parar = url.rstrip("/"), parar
        self.lock = threading.Lock()
        self.pose = {"ativa": "FL", "selecao": ["FL"],
                     "angulos": {p: list(HOME) for p in PERNAS}}
        self.ligado = None
        self.recebidas = 0

    def ler(self):
        with self.lock:
            sel = self.pose.get("selecao") or [self.pose["ativa"]]
            return tuple(sel), dict(self.pose["angulos"])

    def _estado(self, ligado, detalhe=""):
        if ligado != self.ligado:
            self.ligado = ligado
            print("  painel ..... %s%s" % ("conectado" if ligado else "fora do ar",
                                           (" (%s)" % detalhe) if detalhe else ""))

    def run(self):
        versao = -1
        while not self.parar.is_set():
            try:
                alvo = "%s/api/pose?desde=%d" % (self.url, versao)
                with urllib.request.urlopen(alvo, timeout=30) as r:
                    corpo = json.loads(r.read().decode("utf-8"))
                self._estado(True)
                versao = corpo.get("versao", versao)
                pose = corpo.get("pose")
                if pose:
                    with self.lock:
                        self.pose = pose
                    self.recebidas += 1
            except urllib.error.URLError as e:
                self._estado(False, getattr(e, "reason", ""))
                versao = -1
                time.sleep(1.0)
            except Exception as e:
                self._estado(False, str(e))
                versao = -1
                time.sleep(1.0)

def aplicar_pose(m, d, angulos):
    d.qpos[0:3] = [0.0, 0.0, Z_BASE]
    d.qpos[3:7] = [1.0, 0.0, 0.0, 0.0]
    for i, perna in enumerate(PERNAS):
        lo = m.jnt_range[1 + 3 * i:4 + 3 * i, 0]
        hi = m.jnt_range[1 + 3 * i:4 + 3 * i, 1]
        d.qpos[7 + 3 * i:10 + 3 * i] = np.clip(angulos.get(perna, HOME), lo, hi)
    d.qvel[:] = 0.0

def pintar(m, grupos, selecao, matid0, rgba0):
    for perna, ids in grupos.items():
        for gid in ids:
            if perna in selecao:
                m.geom_matid[gid] = -1
                m.geom_rgba[gid] = VELVET
            else:
                m.geom_matid[gid] = matid0[gid]
                m.geom_rgba[gid] = rgba0[gid]

def rodar(m, d, assinante, parar):
    grupos = geoms_por_perna(m)
    matid0 = m.geom_matid.copy()
    rgba0 = m.geom_rgba.copy()
    selecao_pintada = None

    with mujoco.viewer.launch_passive(m, d) as v:
        trava = v.lock()
        try:
            with trava:
                v.opt.geomgroup[:] = 0
                v.opt.geomgroup[0] = 1
                v.opt.geomgroup[1] = 1
                v.opt.geomgroup[2] = 1
                v.cam.lookat[:] = [0.0, 0.0, Z_BASE * 0.65]
                v.cam.distance = 1.5
                v.cam.azimuth = 140
                v.cam.elevation = -16
        except Exception:
            pass

        dt = 1.0 / 60.0
        prox = time.monotonic()
        while not parar.is_set() and v.is_running():
            try:
                selecao, angulos = assinante.ler()
                with trava:
                    aplicar_pose(m, d, angulos)
                    if selecao != selecao_pintada:
                        pintar(m, grupos, frozenset(selecao), matid0, rgba0)
                        selecao_pintada = selecao
                    mujoco.mj_forward(m, d)
                v.sync()
            except Exception:
                traceback.print_exc()
                break

            prox += dt
            atraso = prox - time.monotonic()
            time.sleep(atraso if atraso > 0 else 0)

    parar.set()

def principal():
    ap = argparse.ArgumentParser(description="Espelha o painel no MuJoCo")
    ap.add_argument("--porta", type=int, default=8790, help="porta do painel")
    ap.add_argument("--maquina", default="localhost",
                    help="onde o painel esta rodando, se nao for esta maquina")
    args = ap.parse_args()

    url = "http://%s:%d" % (args.maquina, args.porta)
    print("")
    print("  Espelho do MuJoCo")
    print("  painel ..... %s" % url)

    try:
        pasta = achar_ou_baixar()
    except Exception as e:
        print("\n  %s\n" % e)
        return 1

    m = mujoco.MjModel.from_xml_path(montar_cena(pasta))
    d = mujoco.MjData(m)

    parar = threading.Event()
    assinante = Assinante(url, parar)
    assinante.start()

    print("  janela ..... abrindo; mexa no painel e o robo acompanha")
    print("  feche a janela do MuJoCo para encerrar")
    print("")

    try:
        rodar(m, d, assinante, parar)
    except KeyboardInterrupt:
        pass
    finally:
        parar.set()

    print("\n  encerrado (%d poses aplicadas)." % assinante.recebidas)
    return 0

if __name__ == "__main__":
    sys.exit(principal())
