# prisma-generator-zero

1st terminal run

```
cd packages/generator
npm run dev
```

This will run in watch mode.

2nd terminal

```
cd packages/generator
npx prisma generate
```

Then `schema.ts` is in `prisma/generated`

`schema.prisma` has all the relationship types (I think), and all the field types

> This generator was bootstraped using [create-prisma-generator](https://github.com/YassinEldeeb/create-prisma-generator)
