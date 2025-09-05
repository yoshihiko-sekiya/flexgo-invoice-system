#!/usr/bin/env tsx

/**
 * PDF Storage Cleanup Script
 * 
 * Removes expired PDF files from Supabase Storage based on TTL configuration
 * Designed for weekly cron job execution
 * 
 * Usage:
 *   npx tsx server/scripts/cleanup.ts
 *   
 * Environment Variables:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY  
 *   - SUPABASE_BUCKET (default: reports)
 *   - SUPABASE_SIGNED_URL_TTL_HOURS (default: 168 = 7 days)
 *   - CLEANUP_DRY_RUN (default: false, set to 'true' for testing)
 *   - CLEANUP_DISABLED (set to 'true' to disable, useful for E2E tests)
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

interface CleanupStats {
  totalFiles: number
  expiredFiles: number
  deletedFiles: number
  errors: string[]
  processingTime: number
}

interface FileMetadata {
  name: string
  id: string
  updated_at: string
  created_at: string
  last_accessed_at?: string
  metadata?: Record<string, any>
}

class StorageCleanupService {
  private supabase: ReturnType<typeof createClient>
  private bucket: string
  private ttlHours: number
  private dryRun: boolean
  private disabled: boolean

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    this.bucket = process.env.SUPABASE_BUCKET || 'reports'
    this.ttlHours = parseInt(process.env.SUPABASE_SIGNED_URL_TTL_HOURS || '168')
    this.dryRun = process.env.CLEANUP_DRY_RUN === 'true'
    this.disabled = process.env.CLEANUP_DISABLED === 'true'

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  }

  /**
   * Execute cleanup process
   */
  async cleanup(): Promise<CleanupStats> {
    const startTime = Date.now()
    const stats: CleanupStats = {
      totalFiles: 0,
      expiredFiles: 0,
      deletedFiles: 0,
      errors: [],
      processingTime: 0
    }

    try {
      if (this.disabled) {
        console.log('🚫 Cleanup is disabled via CLEANUP_DISABLED=true')
        return stats
      }

      console.log(`🧹 Starting PDF cleanup process...`)
      console.log(`📁 Bucket: ${this.bucket}`)
      console.log(`⏱️  TTL: ${this.ttlHours} hours`)
      console.log(`🔍 Dry run: ${this.dryRun ? 'YES' : 'NO'}`)
      
      const expiredFiles = await this.findExpiredFiles()
      stats.totalFiles = expiredFiles.length
      stats.expiredFiles = expiredFiles.length

      console.log(`📊 Found ${expiredFiles.length} files to process`)

      if (expiredFiles.length === 0) {
        console.log('✅ No expired files found')
        return stats
      }

      // Process in batches to avoid overwhelming the API
      const batchSize = 50
      for (let i = 0; i < expiredFiles.length; i += batchSize) {
        const batch = expiredFiles.slice(i, i + batchSize)
        const batchResults = await this.processBatch(batch)
        
        stats.deletedFiles += batchResults.deleted
        stats.errors.push(...batchResults.errors)
        
        // Rate limiting
        if (i + batchSize < expiredFiles.length) {
          await this.delay(1000) // 1 second between batches
        }
      }

      console.log(`✅ Cleanup completed: ${stats.deletedFiles}/${stats.expiredFiles} files processed`)
      
      if (stats.errors.length > 0) {
        console.log(`⚠️  Errors encountered: ${stats.errors.length}`)
        stats.errors.forEach(error => console.error(`   - ${error}`))
      }

    } catch (error) {
      const errorMsg = `Fatal cleanup error: ${error instanceof Error ? error.message : 'Unknown error'}`
      console.error(`❌ ${errorMsg}`)
      stats.errors.push(errorMsg)
    }

    stats.processingTime = Date.now() - startTime
    return stats
  }

  /**
   * Find files that have exceeded their TTL
   */
  private async findExpiredFiles(): Promise<FileMetadata[]> {
    const expiredFiles: FileMetadata[] = []
    const cutoffDate = new Date(Date.now() - (this.ttlHours * 60 * 60 * 1000))
    
    try {
      // List all files in the bucket
      const { data: files, error } = await this.supabase.storage
        .from(this.bucket)
        .list('', {
          limit: 1000,
          offset: 0
        })

      if (error) {
        throw new Error(`Failed to list files: ${error.message}`)
      }

      // Recursively process subdirectories (YYYY/MM structure)
      if (files) {
        for (const file of files) {
          if (file.name && !file.name.includes('.')) {
            // This is likely a directory (year folder)
            const yearFiles = await this.listFilesRecursively(file.name)
            expiredFiles.push(...this.filterExpiredFiles(yearFiles, cutoffDate))
          } else if (file.name?.endsWith('.pdf')) {
            // Direct PDF file in root
            if (new Date(file.updated_at || file.created_at) < cutoffDate) {
              expiredFiles.push(file as FileMetadata)
            }
          }
        }
      }

    } catch (error) {
      throw new Error(`Error finding expired files: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    return expiredFiles
  }

  /**
   * Recursively list files in subdirectories
   */
  private async listFilesRecursively(path: string): Promise<FileMetadata[]> {
    const allFiles: FileMetadata[] = []
    
    try {
      const { data: files, error } = await this.supabase.storage
        .from(this.bucket)
        .list(path, {
          limit: 1000,
          offset: 0
        })

      if (error) throw error

      if (files) {
        for (const file of files) {
          const fullPath = `${path}/${file.name}`
          
          if (file.name && !file.name.includes('.')) {
            // Subdirectory
            const subFiles = await this.listFilesRecursively(fullPath)
            allFiles.push(...subFiles)
          } else if (file.name?.endsWith('.pdf')) {
            // PDF file
            allFiles.push({
              ...file,
              name: fullPath
            } as FileMetadata)
          }
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not list files in ${path}:`, error)
    }

    return allFiles
  }

  /**
   * Filter files based on expiration date
   */
  private filterExpiredFiles(files: FileMetadata[], cutoffDate: Date): FileMetadata[] {
    return files.filter(file => {
      const fileDate = new Date(file.updated_at || file.created_at)
      return fileDate < cutoffDate
    })
  }

  /**
   * Process a batch of files for deletion
   */
  private async processBatch(files: FileMetadata[]): Promise<{ deleted: number; errors: string[] }> {
    const result = { deleted: 0, errors: [] as string[] }
    
    if (this.dryRun) {
      console.log(`🔍 DRY RUN: Would delete ${files.length} files:`)
      files.forEach(file => {
        console.log(`   - ${file.name} (${file.updated_at})`)
      })
      result.deleted = files.length
      return result
    }

    // Extract file paths for deletion
    const filePaths = files.map(file => file.name)

    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .remove(filePaths)

      if (error) {
        result.errors.push(`Batch deletion error: ${error.message}`)
        return result
      }

      if (data) {
        result.deleted = data.length
        console.log(`🗑️  Deleted ${data.length} files from batch`)
      }

    } catch (error) {
      result.errors.push(`Batch processing error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    return result
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Main execution
 */
async function main() {
  const cleanup = new StorageCleanupService()
  
  try {
    const stats = await cleanup.cleanup()
    
    console.log('\n📊 Cleanup Statistics:')
    console.log(`   Total files processed: ${stats.totalFiles}`)
    console.log(`   Expired files found: ${stats.expiredFiles}`)
    console.log(`   Files deleted: ${stats.deletedFiles}`)
    console.log(`   Errors: ${stats.errors.length}`)
    console.log(`   Processing time: ${(stats.processingTime / 1000).toFixed(2)}s`)
    
    // Exit with error code if there were failures
    if (stats.errors.length > 0) {
      process.exit(1)
    }
    
    process.exit(0)
    
  } catch (error) {
    console.error('❌ Cleanup script failed:', error)
    process.exit(1)
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export default StorageCleanupService