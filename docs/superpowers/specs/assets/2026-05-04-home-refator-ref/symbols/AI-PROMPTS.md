# Prompts pra gerar o símbolo do hero (InkFlow)

Geradores recomendados (na ordem de qualidade pra ink-stroke):

1. **Midjourney v6** — melhor pra "feel" de tinta orgânica
2. **DALL-E 3** (via ChatGPT Plus / Bing Image Creator grátis) — bom controle textual
3. **Stable Diffusion XL** (local ou Replicate) — mais customizável
4. **Magnific** (que tu já usa) — ótimo pra **upscale** depois de gerar

---

## Versão 1 — "IF" Monogram (iniciais InkFlow)

### Prompt Midjourney v6
```
black ink brush stroke logo monogram letters "IF" combined, hand-drawn calligraphy style, thick organic strokes with rough textured edges, small ink splatters, isolated on pure white background, high contrast vector-ready illustration, tattoo flash style, no shading no gradient, flat black on white, square aspect ratio --ar 1:1 --style raw --v 6 --no shadow, 3d, gradient, colors, gray
```

### Prompt DALL-E 3
```
A bold black ink monogram of the letters "I" and "F" merged together in a tattoo-flash brush-stroke style. Thick organic strokes with hand-painted texture, irregular edges, a few small ink splatters around. Pure flat black on a pure white background. No gradients, no shadows, no 3D effects. Square format, vector-ready, high contrast, suitable for vectorization to SVG. Strong calligraphy feel like Japanese sumi-e or traditional tattoo lettering.
```

### Prompt Stable Diffusion XL
```
Positive: black ink brush logo, "IF" monogram letters, sumi-e calligraphy, tattoo flash style, thick rough strokes, ink splatter, isolated on white background, vector style, flat black, high contrast, hand-drawn, organic edges, masterpiece, best quality
Negative: gradient, color, gray, shadow, 3d, blur, photo, photograph, soft, smooth, digital
Settings: 1024x1024, CFG 7, Steps 30, Sampler DPM++ 2M Karras
```

### Variações pra tentar (rode 4-6 e escolhe)
- "IF" empilhado (I em cima, F embaixo)
- "IF" lado a lado (I à esquerda, F à direita)
- "IF" sobreposto (I e F se cruzam no centro)
- "IF" com circle frame brush (símbolo dentro de um círculo de tinta)

---

## Versão 2 — Máquina de Tatuagem (silhueta ink-stroke)

### Prompt Midjourney v6
```
black ink brush stroke silhouette of a traditional rotary tattoo machine, side profile view, hand-drawn calligraphy style, thick organic textured strokes, small ink splatters and drips at the needle tip, isolated on pure white background, high contrast vector-ready illustration, tattoo flash aesthetic, flat black on white, no shading, no gradient --ar 1:1 --style raw --v 6 --no color, gray, shadow, 3d, photo
```

### Prompt DALL-E 3
```
A black ink brush silhouette of a traditional rotary tattoo machine seen from the side. Hand-painted brush-stroke style with rough organic edges, ink splatter drops near the needle tip simulating ink coming out. Pure flat black on a pure white background. No gradients, no shadows, no 3D effects. Square format, vector-ready, high contrast, suitable for SVG conversion. Has the rough hand-drawn feel of traditional tattoo flash art or Japanese sumi-e ink wash.
```

### Prompt Stable Diffusion XL
```
Positive: black ink silhouette, rotary tattoo machine, side profile, sumi-e brush stroke, tattoo flash, thick rough strokes, ink drops at needle tip, isolated on white background, vector style, flat black, high contrast, hand-drawn, organic, masterpiece, best quality
Negative: gradient, color, gray, shadow, 3d, blur, photo, photograph, modern, machine, electric, wires, soft, smooth, digital
Settings: 1024x1024, CFG 7, Steps 30, Sampler DPM++ 2M Karras
```

### Variações pra tentar
- Coil machine (clássica, mais detalhe visual)
- Rotary machine (mais limpa, simples)
- Pen-style machine (moderna, minimalista)
- Apenas a silhueta da agulha + tip + splatter (mais abstrato)

---

## Workflow após gerar

1. Tu roda **6-12 variações** em cada versão (mesmo prompt × 4 imagens × algumas iterações com pequenas mudanças)
2. Escolhe **as 2-3 melhores** de cada e me manda
3. Eu vetorizo via:
   - `vectorizer.com` (online, gratuito, ~30s)
   - Inkscape Trace Bitmap (local, mais controle)
   - Adobe Illustrator Image Trace (se tu tem)
4. Limpo o SVG, remove imperfeições, ajusto curvas
5. Exporta como `symbol-if.svg` ou `symbol-machine.svg` pra usar no hero

---

## Tip pro Magnific (que tu já usa)

Depois de gerar a imagem inicial em qualquer ferramenta, **passa no Magnific** com:
- Creativity: 4-6 (não muito, pra não inventar detalhes errados)
- HDR: 5-7 (realça as bordas da tinta)
- Resemblance: 8 (mantém estrutura)
- Engine: Magnific Sharpy ou Sparkle

Ajuda muito a deixar as bordas crispy pra vetorização funcionar bem.
