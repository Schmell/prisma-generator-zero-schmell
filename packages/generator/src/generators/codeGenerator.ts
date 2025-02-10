import { DMMF } from '@prisma/generator-helper'
import {
  TransformedSchema,
  ZeroModel,
  ZeroRelationship,
  ZeroTypeMapping,
} from '../types'

const joinTables = new Set<string>()

function generateImports(): string {
  return `import {
  table,
  string,
  boolean,
  number,
  json,
  enumeration,
  relationships,
  createSchema,
  type Row,
} from "@rocicorp/zero";\n\n`
}

function generateEnums(schema: TransformedSchema): string {
  if (schema.enums.length === 0) return ''

  let output = '// Define enums\n'
  schema.enums.forEach((enumType) => {
    output += `export enum ${enumType.name} {\n`
    enumType.values.forEach((value) => {
      const enumValue = value.dbName || value.name
      output += `  ${value.name} = "${enumValue}",\n`
    })
    output += '}\n\n'
  })

  return output
}

function generateColumnDefinition(
  name: string,
  mapping: ZeroTypeMapping,
): string {
  const typeStr = mapping.isOptional
    ? `${mapping.type}.optional()`
    : mapping.type
  return `    ${name}: ${typeStr}`
}

function generateModelSchema(model: ZeroModel): string {
  let output = `export const ${model.zeroTableName} = table("${model.tableName}")\n`
  output += '  .columns({\n'

  Object.entries(model.columns).forEach(([name, mapping]) => {
    output += generateColumnDefinition(name, mapping) + ',\n'
  })

  output += '  })'

  // Add primary key
  output += `\n  .primaryKey(${model.primaryKey
    .map((key) => `"${key}"`)
    .join(', ')});\n\n` //
  return output
}

function generateRelationships(models: ZeroModel[]): string {
  const modelRelationships = models
    .filter(
      (model) =>
        model.relationships && Object.keys(model.relationships).length > 0,
    )
    .map((model) => {
      // i don't know how to type this, but it wasn't before anyway
      const relationshipEntries = Object.entries(model.relationships || {})
      const hasOneRelation = relationshipEntries.some(
        ([, rel]) => rel.type === 'one',
      )
      const hasManyRelation = relationshipEntries.some(
        ([, rel]) => rel.type === 'many',
      )
      const hasImpicitManyRelation = relationshipEntries.some(
        ([, rel]) => rel.type === undefined,
      )

      const relationshipImports = []
      if (hasOneRelation) relationshipImports.push('one')
      if (hasManyRelation || hasImpicitManyRelation)
        relationshipImports.push('many')

      const relationshipsStr = relationshipEntries.map(([name, rel]) => {
        if (rel.type) {
          return `  ${name}: ${rel.type}({
    sourceField: ${JSON.stringify(rel.sourceField)},
    destField: ${JSON.stringify(rel.destField)},
    destSchema: ${rel.destSchema},
  }) \n`
        } else if (!rel.type) {
          // If there is no rel.type it means its an implict relation
          if (rel.length > 0 && Object.keys(rel).length > 0) {
            let out = ''
            rel.forEach((r: ZeroRelationship, idx: number) => {
              // The first destSchema will be the name of the join table
              if (idx === 0) joinTables.add(r.destSchema)

              out += `{
  sourceField: ${JSON.stringify(r.sourceField)},
  destField: ${JSON.stringify(r.destField)},
  destSchema: ${r.destSchema},
}, \n`
            })
            return `
${name}: many(
  ${out}) \n`
          }
        } // else if
      })

      return `export const ${model.zeroTableName}Relationships = relationships(${model.zeroTableName}, ({ ${relationshipImports} }) => ({
  ${relationshipsStr}
}));\n\n`
    })
  generateJoinTables(joinTables)

  return modelRelationships.length > 0
    ? '\n// Define relationships\n' + modelRelationships.join('\n')
    : ''
}

function generateJoinTables<T>(tables: Set<T>) {
  let output = ''
  tables.forEach((table) => {
    output += `export const ${table} = table("${table}")\n`
    output += `  .columns({
     A: string(),
     B: string()
   })
   .primaryKey('A', 'B')\n
 `
  })
  return output
}

function generateSchema(schema: TransformedSchema): string {
  let output = '// Define schema\n'
  output += 'export const schema = createSchema(\n'
  output += `  ${schema.version},\n`
  output += '  {\n'
  output += '    tables: [\n'
  joinTables.forEach((table) => {
    output += `      ${table},\n`
  })
  schema.models.forEach((model) => {
    output += `      ${model.zeroTableName},\n`
  })
  output += '    ],\n'

  // Add relationships to schema if any exist
  const hasRelationships = schema.models.some(
    (model) =>
      model.relationships && Object.keys(model.relationships).length > 0,
  )

  if (hasRelationships) {
    output += '    relationships: [\n'
    schema.models.forEach((model) => {
      if (model.relationships && Object.keys(model.relationships).length > 0) {
        output += `      ${model.zeroTableName}Relationships,\n`
      }
    })
    output += '    ],\n'
  }

  output += '  }\n'
  output += ');\n\n'

  // Add types
  output += '// Define types\n'
  output += 'export type Schema = typeof schema;\n'
  schema.models.forEach((model) => {
    output += `export type ${model.modelName} = Row<typeof schema.tables.${model.tableName}>;\n`
  })

  return output
}

export function generateCode(schema: TransformedSchema): string {
  let output = '// Generated by Zero Schema Generator\n'

  // Add imports
  output += generateImports()

  // Add enums
  output += generateEnums(schema)

  // Add models
  output += '// Define tables\n'
  schema.models.forEach((model) => {
    output += generateModelSchema(model)
  })

  // generate relationships first get the Set for joinTables
  const relationships = generateRelationships(schema.models)

  // Add join tables
  output += generateJoinTables(joinTables)

  // Add relationships
  output += relationships

  // Add schema
  output += generateSchema(schema)

  // Add hash comment
  output +=
    '\n// DO NOT TOUCH THIS. The schema hash is used to determine if the schema has changed and correctly update the version.\n'
  output += `// Schema hash: ${schema.hash}\n`

  return output
}
