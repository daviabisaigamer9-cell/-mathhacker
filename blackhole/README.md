# 🕳️ Horizonte de Eventos — Simulador de Buraco Negro

Simulador relativístico de buraco negro em tempo real, pensado para a GPU do celular
(**Poco F6 Pro · Snapdragon 8 Gen 2 · Adreno 740**). É um único arquivo `index.html`, sem
dependências e sem build: roda direto no Chrome via WebGL 2.

## 📱 Como abrir no Poco F6 Pro

Qualquer uma das opções abaixo funciona. O ideal é HTTPS, que libera tela cheia, modo offline e
instalação como app.

1. **GitHub Pages** (mais simples): no GitHub, abra *Settings → Pages*, escolha
   *Deploy from a branch*, branch `main`, pasta `/ (root)`. Depois abra no celular:
   `https://daviabisaigamer9-cell.github.io/-mathhacker/blackhole/`
2. **Pelo servidor do MathHacker**: o `server.js` já serve a pasta inteira como estática, então
   com `npm start` o simulador fica em `/blackhole/` (local ou no deploy).
3. **Na rede local**: no PC, rode `npx serve .` dentro da pasta `blackhole/` e abra
   `http://IP-DO-PC:3000` no celular (mesmo Wi-Fi). Em HTTP sem HTTPS não há modo offline.

Para virar app: no Chrome, toque em **⋮ → Adicionar à tela inicial / Instalar app**. Ele abre em
tela cheia, com ícone próprio, e funciona offline depois do primeiro acesso.

## 🎛️ O que tem

- **Menu principal** com cenários, configurações, tela cheia e um guia de física.
- **8 cenários**: Realista, Gargantua (Interstellar), M87\*, Sagitário A\*, Cygnus X-1,
  Schwarzschild, Kerr extremo e Lente pura.
- **Ajustes em 5 abas**:
  - *Buraco negro*: massa e rotação.
  - *Disco*: raio, temperatura, brilho, turbulência, Doppler, redshift e jatos.
  - *Câmera*: distância, inclinação, campo de visão e órbita automática.
  - *Gráficos*: qualidade, resolução, passos por raio, precisão e limite de FPS.
  - *Efeitos*: estrelas, Via Láctea, bloom, exposição, vinheta, granulação e som.
- **Mergulho**: queda livre até o horizonte, com tempo próprio, velocidade, fator γ, relógio
  distante e força de maré em tempo real.
- **Painel de dados físicos**: horizonte, ISCO, esfera de fótons, ergosfera, temperatura Hawking,
  tempo de evaporação, dilatação temporal, maré e período orbital.
- **Captura em alta resolução** (renderização em faixas para não travar a GPU), com salvar e
  compartilhar.
- **Controles de toque**: arraste para orbitar ou olhar, pince para aproximar e toque duas vezes
  para esconder a interface.
- **Resolução dinâmica**, que mantém o FPS e ajusta a carga da GPU sozinha.

## 🔬 A física

- Para cada pixel, um raio de luz é integrado de trás para a frente pelas **geodésicas nulas da
  métrica de Kerr** (Boyer–Lindquist, forma hamiltoniana com E e L conservados), com
  **Runge–Kutta 4 e passo adaptativo**, tudo no fragment shader.
- A equação radial usa a forma separada `2ΣH = Δp_r² − P²/Δ + Θ(θ)`, que evita o cancelamento
  numérico em `float32`, a precisão da GPU do celular.
- O tamanho da sombra foi validado contra fórmulas exatas: erro de **0,1%** para Schwarzschild
  (fórmula de Synge) e de no máximo **1 pixel (< 1%)** contra a borda de Bardeen para `a = 0,998`.
- Disco fino kepleriano com perfil de temperatura de Novikov–Thorne. A cor vem da lei de Planck
  integrada nas curvas CIE 1931. O desvio g é calculado exatamente para cada raio, e o brilho
  escala com g⁴ (Doppler e redshift gravitacional podem ser ligados e desligados).
- A câmera é um observador ZAMO. No mergulho, aplica-se a aberração relativística de quem cai
  livremente a partir do repouso no infinito.

## ⚙️ Desempenho

| Qualidade   | Resolução | Passos/raio | Uso indicado                   |
|-------------|-----------|-------------|--------------------------------|
| Bateria     | 30%       | 260         | Celulares mais fracos, economia |
| Equilibrado | 42%       | 360         | Snapdragon intermediário        |
| Alta        | 58%       | 500         | Padrão em Adreno 730 ou superior |
| Ultra       | 80%       | 700         | Capturas e PCs com GPU dedicada |

A porcentagem é da resolução nativa da tela. Com a resolução dinâmica ligada, o simulador reduz a
resolução quando o FPS cai e aumenta de novo quando sobra GPU.
