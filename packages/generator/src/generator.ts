import { generatorHandler, GeneratorOptions } from '@prisma/generator-helper'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { transformSchema } from './mappers/schemaMapper'
import { generateCode } from './generators/codeGenerator'
import { getCurrentVersion, calculateNextVersion } from './utils/version'

export async function onGenerate(options: GeneratorOptions) {
  const { generator, dmmf } = options
  const outputFile = 'schema.ts'
  const outputDir = generator.output?.value

  if (!outputDir) {
    throw new Error('Output directory is required')
  }

  const config = {
    name: generator.name,
    prettier: generator.config.prettier === 'true', // Default false,
    resolvePrettierConfig: generator.config.resolvePrettierConfig !== 'false', // Default true
    schemaVersion: generator.config.schemaVersion
      ? Number(generator.config.schemaVersion)
      : undefined,
  }

  // Get current version and hash
  const { version: currentVersion, hash: currentHash } =
    await getCurrentVersion(outputDir, outputFile)

  // Transform the schema
  const transformedSchema = transformSchema(dmmf, currentVersion)

  // Calculate next version
  const nextVersion = calculateNextVersion(
    currentVersion,
    currentHash,
    transformedSchema.hash,
    config.schemaVersion,
  )

  // Update version in transformed schema
  transformedSchema.version = nextVersion

  // Generate code
  let output = generateCode(transformedSchema)

  // Apply prettier if configured
  if (config.prettier) {
    let prettier: typeof import('prettier')
    try {
      prettier = await import('prettier')
    } catch {
      throw new Error('Unable import Prettier. Is it installed?')
    }

    const prettierOptions = config.resolvePrettierConfig
      ? await prettier.resolveConfig(outputFile)
      : null

    output = await prettier.format(output, {
      ...prettierOptions,
      parser: 'typescript',
    })
  }

  await mkdir(outputDir, { recursive: true })
  await writeFile(join(outputDir, outputFile), output)
}

// Use the exported function in the generator handler
generatorHandler({
  onManifest() {
    return {
      version: '1',
      defaultOutput: 'generated/zero',
      prettyName: 'Zero Schema',
    }
  },
  onGenerate,
})
