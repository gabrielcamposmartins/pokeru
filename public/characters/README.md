# Arte dos personagens

Esta pasta é **gerada** por `npm run prepare:characters` a partir das ilustrações em
`assets/characters/`. Para cada personagem são criados:

- `<id>/full.png` — corpo inteiro com o fundo branco removido (menu, tela de Personagens, cut-ins);
- `<id>/portrait.png` — retrato quadrado recortado da ilustração (aparece **na mesa**).

## Adicionar ou trocar um personagem

1. Coloque a ilustração de corpo inteiro (fundo branco ou transparente) em `assets/characters/`.
2. Em `scripts/prepare-characters.mjs`, adicione a entrada com o arquivo e o recorte do retrato
   (`cx`, `cy` = centro do rosto; `side` = lado do quadrado, em pixels da imagem original).
   Se sobrar fundo branco preso entre braço e corpo, adicione um ponto em `holes`.
3. Rode `npm run prepare:characters` (use `CHECK_DIR=pasta` para gerar prévias sobre fundo escuro).
4. Registre o personagem em `CHARACTER_PRESETS` (`shared/styles.ts`): nome, título, falas, cores da
   moldura e os braços que combinam com a roupa.
