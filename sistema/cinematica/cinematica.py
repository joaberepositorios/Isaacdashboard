# -*- coding: utf-8 -*-
"""
================================================================================
  BANCADA DE CINEMATICA DO GO2  --  servidor do painel
================================================================================

Mesma bancada didatica do script go2_cinematica.py, agora no navegador:
escolher a perna, mexer q1/q2/q3 e ver a posicao do pe (cinematica direta),
ou digitar x/y/z e ver os angulos (cinematica inversa), com as matrizes 4x4
da cadeia e as duas vistas 2D.

O QUE MUDOU EM RELACAO AO SCRIPT ORIGINAL
------------------------------------------
  - Nao usa MuJoCo, nem baixa as malhas do mujoco_menagerie, nem abre janela
    OpenGL. O robo e' desenhado em canvas 2D com projecao propria: roda em
    qualquer maquina, inclusive sem GPU e sem placa de video dedicada.
  - Nao usa matplotlib, nem Tk, nem Qt -- some a cacada por back-end grafico
    que era a causa da "janela que nao abre" no Windows.
  - Nao instala nada: so' a biblioteca padrao do Python, como o resto do
    Dashboard Isaac. Uma janela so', dentro do navegador.
  - A matematica e' a MESMA, portada linha a linha para painel/cinema.js, e o
    autoteste round-trip FK -> IK -> FK roda ao abrir a pagina (o resultado
    aparece na pilula do canto superior direito).

As medidas e os limites de junta foram lidos do proprio go2.xml do
mujoco_menagerie e estao anotados em painel/cinema.js, com a linha de origem.

  python cinematica.py                 so' esta maquina, porta 8790
  python cinematica.py --porta 9000    outra porta
  python cinematica.py --aberto        aceita conexoes de outras maquinas
================================================================================
"""

import argparse
import json
import os
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

AQUI = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(AQUI, "painel")

TIPOS = {".html": "text/html; charset=utf-8",
         ".js": "application/javascript; charset=utf-8",
         ".css": "text/css; charset=utf-8",
         ".svg": "image/svg+xml"}

PERNAS = ("FL", "FR", "RL", "RR")
ESPERA_ESPELHO = 10.0     # s que o pedido do espelho fica pendurado esperando
JANELA_VIVO = 4.0         # s sem pedido do espelho para considera-lo desligado


class Pose:
    """A pose corrente da bancada, e a ponte entre o painel e o MuJoCo.

    O painel PUBLICA (POST) toda vez que algo muda; o espelho ASSINA (GET) e
    fica pendurado ate' haver mudanca, em vez de perguntar em laco. Assim o
    MuJoCo anda junto com o slider sem torrar CPU perguntando 60 vezes por
    segundo se mudou alguma coisa.
    """

    def __init__(self):
        self.cond = threading.Condition()
        self.versao = 0
        self.dado = None
        self.visto_em = 0.0        # ultimo pedido do espelho

    def publicar(self, dado):
        with self.cond:
            self.dado = dado
            self.versao += 1
            self.cond.notify_all()

    def assinar(self, desde, espera):
        """devolve (dado, versao); dado e' None se nada mudou ate' o prazo"""
        limite = time.monotonic() + espera
        with self.cond:
            self.visto_em = time.monotonic()
            while self.versao == desde:
                resta = limite - time.monotonic()
                if resta <= 0:
                    return None, self.versao
                self.cond.wait(resta)
            self.visto_em = time.monotonic()
            return self.dado, self.versao

    def espelho_vivo(self):
        with self.cond:
            return (time.monotonic() - self.visto_em) < JANELA_VIVO


def validar(dado):
    """so' passa o que o espelho consegue aplicar sem quebrar"""
    if not isinstance(dado, dict):
        raise ValueError("esperava um objeto")
    if dado.get("ativa") not in PERNAS:
        raise ValueError("perna ativa invalida")
    angulos = dado.get("angulos")
    if not isinstance(angulos, dict) or set(angulos) != set(PERNAS):
        raise ValueError("faltam angulos de alguma perna")
    limpo = {}
    for perna, q in angulos.items():
        if not isinstance(q, list) or len(q) != 3:
            raise ValueError("a perna %s precisa de 3 angulos" % perna)
        vs = []
        for v in q:
            v = float(v)
            if v != v or v in (float("inf"), float("-inf")):
                raise ValueError("angulo nao finito em %s" % perna)
            vs.append(v)
        limpo[perna] = vs
    return {"ativa": dado["ativa"], "angulos": limpo}


class Manipulador(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "BancadaCinematica"

    def log_message(self, formato, *args):
        pass

    def _erro(self, codigo, texto):
        corpo = texto.encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _json(self, obj, codigo=200):
        corpo = json.dumps(obj).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(corpo)

    def _arquivo(self, pasta, nome):
        # so' o nome do arquivo, nunca o caminho: fecha a porta para ../../
        alvo = os.path.join(pasta, os.path.basename(nome))
        if not os.path.isfile(alvo):
            return self._erro(404, "nao encontrado: %s" % nome)
        with open(alvo, "rb") as fp:
            corpo = fp.read()
        ext = os.path.splitext(alvo)[1].lower()
        self.send_response(200)
        self.send_header("Content-Type", TIPOS.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        caminho, _, cru = self.path.partition("?")
        consulta = dict(p.split("=", 1) for p in cru.split("&") if "=" in p)

        if caminho in ("/", "/index.html"):
            return self._arquivo(APP, "index.html")
        if caminho.startswith("/app/"):
            return self._arquivo(APP, caminho)

        # o espelho do MuJoCo pendura o pedido aqui ate' a pose mudar
        if caminho == "/api/pose":
            try:
                desde = int(consulta.get("desde", "-1"))
            except ValueError:
                desde = -1
            dado, versao = self.server.pose.assinar(desde, ESPERA_ESPELHO)
            return self._json({"versao": versao, "pose": dado})

        return self._erro(404, "nao encontrado")

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/pose":
            return self._erro(404, "nao encontrado")
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0 or n > 64 * 1024:
                raise ValueError("corpo vazio ou grande demais")
            dado = validar(json.loads(self.rfile.read(n).decode("utf-8")))
        except Exception as e:
            return self._json({"erro": str(e)}, 400)
        self.server.pose.publicar(dado)
        # a resposta diz ao painel se tem alguem do outro lado ouvindo
        return self._json({"espelho": self.server.pose.espelho_vivo()})


def principal():
    ap = argparse.ArgumentParser(description="Bancada de cinematica do Go2")
    ap.add_argument("--porta", type=int, default=8790)
    ap.add_argument("--aberto", action="store_true",
                    help="aceita conexoes de outras maquinas (senao, so localhost)")
    ap.add_argument("--sem-navegador", action="store_true",
                    help="nao abre o navegador sozinho")
    args = ap.parse_args()

    endereco = "0.0.0.0" if args.aberto else "127.0.0.1"
    try:
        servidor = ThreadingHTTPServer((endereco, args.porta), Manipulador)
    except OSError as e:
        print("\n  nao consegui subir na porta %d: %s" % (args.porta, e))
        print("  tente outra:  python cinematica.py --porta %d\n" % (args.porta + 1))
        return 1
    servidor.daemon_threads = True
    servidor.pose = Pose()

    url = "http://localhost:%d/" % args.porta
    print("")
    print("  Bancada de cinematica do Go2")
    print("  painel ..... %s" % url)
    print("  MuJoCo ..... noutro terminal:  python espelho_mujoco.py --porta %d"
          % args.porta)
    if args.aberto:
        print("  na rede .... http://<ip-desta-maquina>:%d/" % args.porta)
    else:
        print("  (somente esta maquina; use --aberto para liberar na rede)")
    print("  Ctrl+C para encerrar")
    print("")

    if not args.sem_navegador:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()

    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\n  encerrando...")
        servidor.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(principal())
