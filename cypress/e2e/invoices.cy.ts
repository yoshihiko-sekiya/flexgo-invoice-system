/// <reference types="cypress" />

describe('Invoice Flow E2E Tests', () => {
  const testData = {
    partner: {
      name: 'Test Transport Co.',
      billingCode: 'TEST001'
    },
    rateCard: {
      serviceName: 'Standard Delivery',
      baseRate: '5000',
      overtimeRate: '7500'
    },
    invoice: {
      periodStart: '2025-08-01',
      periodEnd: '2025-08-31',
      memo: 'Test invoice for E2E automation'
    },
    invoiceItem: {
      description: 'Delivery service',
      quantity: '10',
      deliveryDate: '2025-08-15',
      vehicleNo: 'TEST-001',
      driverName: 'Test Driver'
    }
  }

  beforeEach(() => {
    // Mock authentication and user role
    cy.window().then((win) => {
      win.localStorage.setItem('user-role', 'Manager')
      win.localStorage.setItem('user-email', 'test-manager@example.com')
    })

    // Visit the application
    cy.visit('/')
    
    // Wait for initial load and navigate to invoices
    cy.get('[data-cy="nav-invoices"]', { timeout: 10000 }).should('be.visible')
  })

  context('Full Invoice Workflow', () => {
    it('should complete the full invoice lifecycle: create → add items → PDF → approve', () => {
      // Step 1: Navigate to invoices list
      cy.get('[data-cy="nav-invoices"]').click()
      cy.url().should('include', '/invoices')
      cy.get('h1').should('contain', '請求書管理')

      // Step 2: Create new invoice
      cy.get('[data-cy="create-invoice-btn"]').should('be.visible').click()
      cy.url().should('include', '/invoices/new')

      // Fill invoice form
      cy.get('[data-cy="edit-period-start"]').type(testData.invoice.periodStart)
      cy.get('[data-cy="edit-period-end"]').type(testData.invoice.periodEnd)
      cy.get('[data-cy="edit-partner-select"]').select('1') // Select first partner from mock data
      cy.get('[data-cy="edit-memo"]').type(testData.invoice.memo)

      // Save invoice
      cy.get('[data-cy="save-invoice-btn"]').click()
      cy.get('.alert-success', { timeout: 5000 }).should('contain', '保存')

      // Step 3: Add invoice items (if add item functionality exists)
      cy.get('[data-cy="add-item-btn"]').then(($btn) => {
        if ($btn.is(':visible')) {
          $btn.click()
          
          // Fill item details
          cy.get('[data-cy="item-description"]').type(testData.invoiceItem.description)
          cy.get('[data-cy="item-quantity"]').type(testData.invoiceItem.quantity)
          cy.get('[data-cy="item-delivery-date"]').type(testData.invoiceItem.deliveryDate)
          cy.get('[data-cy="item-vehicle-no"]').type(testData.invoiceItem.vehicleNo)
          cy.get('[data-cy="item-driver-name"]').type(testData.invoiceItem.driverName)
          
          // Save item
          cy.get('[data-cy="save-item-btn"]').click()
          cy.get('.table tbody tr').should('have.length.at.least', 1)
        }
      })

      // Step 4: Generate PDF
      cy.get('[data-cy="download-pdf-btn"]').should('be.visible').click()
      
      // Wait for PDF generation (check for download or success message)
      cy.wait(3000) // Allow time for PDF generation

      // Step 5: Submit for approval
      cy.get('[data-cy="submit-invoice-btn"]').then(($btn) => {
        if ($btn.is(':visible')) {
          $btn.click()
          
          // Verify status change
          cy.get('.badge').should('contain', '承認申請')
        }
      })

      // Step 6: Navigate to approvals page and approve
      cy.get('[data-cy="nav-approvals"]').click()
      cy.url().should('include', '/invoices/approvals')

      // Select the created invoice from pending tab
      cy.get('[data-cy="tab-pending"]').click()
      cy.get('[data-cy^="pending-invoice-"]').first().click()

      // Approve the invoice
      cy.get('[data-cy="approve-btn"]').should('be.visible').click()
      
      // Verify approval
      cy.get('.badge').should('contain', '承認済み')

      // Step 7: Verify completed workflow
      cy.get('[data-cy="tab-completed"]').click()
      cy.get('[data-cy^="completed-invoice-"]').should('have.length.at.least', 1)
    })

    it('should handle invoice rejection workflow', () => {
      // Navigate to invoices and create a basic invoice
      cy.get('[data-cy="nav-invoices"]').click()
      cy.get('[data-cy="create-invoice-btn"]').click()
      
      // Quick invoice creation
      cy.get('[data-cy="edit-period-start"]').type(testData.invoice.periodStart)
      cy.get('[data-cy="edit-period-end"]').type(testData.invoice.periodEnd)
      cy.get('[data-cy="edit-partner-select"]').select('1')
      cy.get('[data-cy="save-invoice-btn"]').click()
      
      // Submit for approval
      cy.get('[data-cy="submit-invoice-btn"]').click()

      // Navigate to approvals
      cy.get('[data-cy="nav-approvals"]').click()
      cy.get('[data-cy="tab-pending"]').click()
      cy.get('[data-cy^="pending-invoice-"]').first().click()

      // Reject the invoice
      cy.get('[data-cy="reject-btn"]').click()
      cy.get('[data-cy="reject-comment"]').type('テスト用の差戻しコメント')
      cy.get('[data-cy="confirm-reject-btn"]').click()

      // Verify rejection
      cy.get('[data-cy="tab-rejected"]').click()
      cy.get('[data-cy^="rejected-invoice-"]').should('have.length.at.least', 1)
    })
  })

  context('Invoice List and Filtering', () => {
    it('should filter invoices by date range', () => {
      cy.get('[data-cy="nav-invoices"]').click()
      
      // Set date filters
      cy.get('[data-cy="filter-period-start"]').type('2025-08-01')
      cy.get('[data-cy="filter-period-end"]').type('2025-08-31')
      cy.get('[data-cy="search-btn"]').click()

      // Verify filtering worked (at least no error)
      cy.get('.table tbody').should('be.visible')
    })

    it('should filter invoices by status', () => {
      cy.get('[data-cy="nav-invoices"]').click()
      
      // Filter by Draft status
      cy.get('[data-cy="filter-status"]').select('Draft')
      cy.get('[data-cy="search-btn"]').click()

      // Verify filtering
      cy.get('.table tbody').should('be.visible')
    })

    it('should clear all filters', () => {
      cy.get('[data-cy="nav-invoices"]').click()
      
      // Set some filters
      cy.get('[data-cy="filter-period-start"]').type('2025-08-01')
      cy.get('[data-cy="filter-status"]').select('Draft')
      
      // Clear filters
      cy.get('[data-cy="clear-filters-btn"]').click()
      
      // Verify filters are cleared
      cy.get('[data-cy="filter-period-start"]').should('have.value', '')
      cy.get('[data-cy="filter-status"]').should('have.value', '')
    })
  })

  context('Invoice Detail Operations', () => {
    it('should edit invoice basic information', () => {
      // Assume there's at least one invoice to edit
      cy.get('[data-cy="nav-invoices"]').click()
      
      // Click on first invoice row to view details
      cy.get('.table tbody tr').first().click()
      
      // Toggle edit mode
      cy.get('[data-cy="toggle-edit-btn"]').then(($btn) => {
        if ($btn.is(':visible')) {
          $btn.click()
          
          // Edit some fields
          cy.get('[data-cy="edit-memo"]').clear().type('Updated memo for E2E test')
          
          // Save changes
          cy.get('[data-cy="save-invoice-btn"]').click()
          
          // Verify save (look for success message or updated content)
          cy.contains('Updated memo for E2E test').should('be.visible')
        }
      })
    })

    it('should download PDF from detail view', () => {
      cy.get('[data-cy="nav-invoices"]').click()
      cy.get('.table tbody tr').first().click()
      
      // Download PDF
      cy.get('[data-cy="download-pdf-btn"]').should('be.visible').click()
      
      // Wait for download to complete
      cy.wait(2000)
    })
  })

  context('Approval Queue Operations', () => {
    it('should navigate between approval tabs', () => {
      cy.get('[data-cy="nav-approvals"]').click()
      
      // Test all tabs
      cy.get('[data-cy="tab-pending"]').click()
      cy.get('[data-cy="tab-pending"]').should('have.class', 'active')
      
      cy.get('[data-cy="tab-rejected"]').click()
      cy.get('[data-cy="tab-rejected"]').should('have.class', 'active')
      
      cy.get('[data-cy="tab-completed"]').click()
      cy.get('[data-cy="tab-completed"]').should('have.class', 'active')
    })

    it('should view invoice details in approval queue', () => {
      cy.get('[data-cy="nav-approvals"]').click()
      cy.get('[data-cy="tab-pending"]').click()
      
      // Select an invoice if available
      cy.get('[data-cy^="pending-invoice-"]').then(($invoices) => {
        if ($invoices.length > 0) {
          cy.wrap($invoices.first()).click()
          
          // Verify detail panel shows
          cy.get('[data-cy="view-detail-btn"]').should('be.visible')
          cy.get('[data-cy="download-pdf-btn"]').should('be.visible')
        }
      })
    })
  })

  context('Error Handling', () => {
    it('should handle network errors gracefully', () => {
      // Mock network failure
      cy.intercept('GET', '/api/invoices*', { forceNetworkError: true }).as('networkError')
      
      cy.get('[data-cy="nav-invoices"]').click()
      
      // Should show error message
      cy.get('.alert-danger', { timeout: 10000 }).should('be.visible')
    })

    it('should validate required fields in invoice creation', () => {
      cy.get('[data-cy="nav-invoices"]').click()
      cy.get('[data-cy="create-invoice-btn"]').click()
      
      // Try to save without required fields
      cy.get('[data-cy="save-invoice-btn"]').click()
      
      // Should show validation errors
      cy.get('.is-invalid, .invalid-feedback').should('have.length.at.least', 1)
    })
  })

  afterEach(() => {
    // Clean up any test data if needed
    cy.window().then((win) => {
      // Clear localStorage
      win.localStorage.clear()
    })
  })
})

// Helper functions for invoice testing
declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Create a test invoice with minimal required data
       */
      createTestInvoice(data?: Partial<typeof testData.invoice>): Chainable<Element>
      
      /**
       * Navigate to a specific invoice by ID
       */
      goToInvoice(invoiceId: string): Chainable<Element>
    }
  }
}

Cypress.Commands.add('createTestInvoice', (data = {}) => {
  const invoiceData = { ...testData.invoice, ...data }
  
  cy.get('[data-cy="nav-invoices"]').click()
  cy.get('[data-cy="create-invoice-btn"]').click()
  
  cy.get('[data-cy="edit-period-start"]').type(invoiceData.periodStart)
  cy.get('[data-cy="edit-period-end"]').type(invoiceData.periodEnd)
  cy.get('[data-cy="edit-partner-select"]').select('1')
  
  if (invoiceData.memo) {
    cy.get('[data-cy="edit-memo"]').type(invoiceData.memo)
  }
  
  cy.get('[data-cy="save-invoice-btn"]').click()
  
  return cy.get('.alert-success', { timeout: 5000 })
})

Cypress.Commands.add('goToInvoice', (invoiceId: string) => {
  cy.visit(`/invoices/${invoiceId}`)
  return cy.get('.invoice-detail', { timeout: 10000 })
})