export interface PricingParameters {
  serviceName: string;
  unitPrice: number;
  pricingType: 'per_page' | 'fixed' | 'per_item';
  pages?: number;
  quantity?: number; // copies or custom input quantity
  extras?: Array<{ name: string; price: number }>;
}

export interface PricingBreakdownItem {
  description: string;
  unitPrice: number;
  quantity: number;
  total: number;
}

export interface PricingEngineResult {
  breakdown: PricingBreakdownItem[];
  totalAmount: number;
}

export class ServiceFlowEngine {
  /**
   * Intelligently determines flow path for a service
   */
  public static determineFlowType(service: {
    requires_upload: boolean;
    requires_physical_input: boolean;
  }): 'upload' | 'physical' | 'digital' {
    if (service.requires_upload) {
      return 'upload';
    } else if (service.requires_physical_input) {
      return 'physical';
    } else {
      return 'digital';
    }
  }

  /**
   * Universal dynamic pricing calculator based on rules
   */
  public static calculatePrice(params: PricingParameters): PricingEngineResult {
    const breakdown: PricingBreakdownItem[] = [];
    let totalAmount = 0;

    const basePrice = params.unitPrice;
    const qty = params.quantity || 1;
    const pgs = params.pages || 1;

    // 1. Calculate main service charges
    if (params.pricingType === 'per_page') {
      const lineTotal = basePrice * pgs * qty;
      breakdown.push({
        description: `${params.serviceName} (${pgs} pgs × ${qty} qty)`,
        unitPrice: basePrice,
        quantity: pgs * qty,
        total: lineTotal,
      });
      totalAmount += lineTotal;
    } else if (params.pricingType === 'per_item') {
      const lineTotal = basePrice * qty;
      breakdown.push({
        description: `${params.serviceName} (× ${qty} items)`,
        unitPrice: basePrice,
        quantity: qty,
        total: lineTotal,
      });
      totalAmount += lineTotal;
    } else {
      // 'fixed' pricing type (flat rates like CV Writing, eCitizen)
      const lineTotal = basePrice;
      breakdown.push({
        description: `${params.serviceName} (Flat rate)`,
        unitPrice: basePrice,
        quantity: 1,
        total: lineTotal,
      });
      totalAmount += lineTotal;
    }

    // 2. Add supplementary extras if selected
    if (params.extras && params.extras.length > 0) {
      for (const extra of params.extras) {
        const lineTotal = extra.price * qty; // applied per copy/qty
        breakdown.push({
          description: `${extra.name} extra (× ${qty})`,
          unitPrice: extra.price,
          quantity: qty,
          total: lineTotal,
        });
        totalAmount += lineTotal;
      }
    }

    return {
      breakdown,
      totalAmount: parseFloat(totalAmount.toFixed(2)),
    };
  }
}
