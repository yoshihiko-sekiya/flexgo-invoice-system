import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { authGuard } from './guards'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/pages/auth/Login.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/logout',
    name: 'Logout',
    component: () => import('@/pages/auth/Logout.vue')
  },
  {
    path: '/health',
    name: 'Health',
    component: () => import('@/pages/Health.vue')
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/components/layout/AppShell.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        component: () => import('@/pages/Dashboard.vue')
      }
    ]
  },
  {
    path: '/map',
    name: 'Map',
    component: () => import('@/components/layout/AppShell.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        component: () => import('@/pages/Map.vue')
      }
    ]
  },
  {
    path: '/reports',
    name: 'Reports',
    component: () => import('@/components/layout/AppShell.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        component: () => import('@/pages/Reports.vue')
      },
      {
        path: 'preview',
        name: 'ReportsPreview',
        component: () => import('@/pages/reports/Preview.vue')
      }
    ]
  },
  {
    path: '/vehicles',
    name: 'Vehicles',
    component: () => import('@/components/layout/AppShell.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        component: () => import('@/pages/Vehicles.vue')
      }
    ]
  },
  {
    path: '/invoices',
    name: 'Invoices',
    component: () => import('@/components/layout/AppShell.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'InvoicesList',
        component: () => import('@/pages/invoices/List.vue')
      },
      {
        path: ':id',
        name: 'InvoicesDetail',
        component: () => import('@/pages/invoices/Detail.vue'),
        props: true
      },
      {
        path: 'approvals',
        name: 'InvoicesApprovals',
        component: () => import('@/pages/invoices/Approvals.vue')
      },
      {
        path: 'preview',
        name: 'InvoicesPreview',
        component: () => import('@/pages/invoices/Preview.vue')
      }
    ]
  },
  {
    path: '/:catchAll(.*)',
    name: 'NotFound',
    redirect: '/dashboard'
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

// Apply auth guard
router.beforeEach(authGuard)

export default router