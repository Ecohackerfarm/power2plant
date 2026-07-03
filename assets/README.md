# Graphics assets

Design source files. Nothing here is served by the app at runtime — the live
images live in [`/public`](../public). This folder is the editable source of
truth those exports are generated from.

```
assets/
  raw/        Editable masters and original illustrations
    logo.xcf            GIMP source for the round logo
    deco-left.xcf       GIMP source for the left corner plants
    deco-right.xcf      GIMP source for the right corner plants
    centerpiece.png     "Harmonic Garden" centerpiece artwork (→ public/center.png)
    flower-roots-1.*    Original plant-with-roots illustrations
    flower-roots-2.*

  export/     Flattened PNGs mirrored into /public
    center.png          Brand centerpiece backdrop
    deco_left-2.png     Top-left corner plant
    deco_left.png       Bottom-left corner plant
    deco_right-2.png    Top-right corner plant
    deco_right.png      Bottom-right corner plant (no roots)
    logo.png            Round logo
```

When you change an export, copy it into `/public` with the same name so the app
picks it up.
