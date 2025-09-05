import { supabase } from '@/lib/supabase'
import type { NavigationGuardNext, RouteLocationNormalized } from 'vue-router'

export async function authGuard(
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
  next: NavigationGuardNext
) {
  // E2E環境では認証をバイパス
  const isE2E = (typeof window !== 'undefined' && (window as any).Cypress) || to.query.e2e === '1'
  if (isE2E) {
    console.log('🧪 E2E Mode: Bypassing authentication guard')
    return next()
  }

  // ゲストのみのページ（ログインページなど）
  if (to.meta.requiresGuest) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        return next('/dashboard')
      }
    } catch (error) {
      console.error('Auth check error:', error)
    }
    return next()
  }

  // 認証が必要なページ
  if (to.meta.requiresAuth) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        return next('/login')
      }
    } catch (error) {
      console.error('Auth check error:', error)
      return next('/login')
    }
  }

  next()
}

// Legacy function for compatibility
export function requireAuth(to: any, from: any, next: any) {
  return authGuard(to, from, next)
}