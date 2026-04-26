const Order = require('../../models/Order');

class FinancialReports {
  async getProfitReport(startDate, endDate) {
    const query = {
      orderStatus: 'completed',
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    const orders = await Order.find(query);
    
    // In a real scenario, you'd store 'cost' in the Order model
    // For now, we'll calculate based on a mock 15% margin
    const stats = orders.reduce((acc, order) => {
      const revenue = parseFloat(order.amount) || 0;
      const cost = revenue * 0.85; // Mock 85% cost
      const profit = revenue - cost;

      acc.totalRevenue += revenue;
      acc.totalCost += cost;
      acc.totalProfit += profit;
      acc.orderCount++;

      // Group by gameType
      const game = order.gameType || 'Unknown';
      if (!acc.byGame[game]) {
        acc.byGame[game] = { revenue: 0, count: 0 };
      }
      acc.byGame[game].revenue += revenue;
      acc.byGame[game].count++;

      return acc;
    }, {
      totalRevenue: 0,
      totalCost: 0,
      totalProfit: 0,
      orderCount: 0,
      byGame: {}
    });

    return stats;
  }
}

module.exports = new FinancialReports();