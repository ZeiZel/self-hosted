# ExpenseOwl

A self-hosted expense tracking application.

[GitHub Repository](https://github.com/tanq16/expenseowl)

## Quick Start

1. (Optional) Copy `.env.example` to `.env` and adjust port if needed:
   ```bash
   cp .env.example .env
   ```

2. Start the service:
   ```bash
   docker compose up -d
   ```

3. Access ExpenseOwl at `http://localhost:4000` (or your configured port)

## Features

- Expense tracking
- Category management
- Budget planning
- Data export
- Self-hosted

## Configuration

Data is stored in `./data` directory. The application will initialize on first start.

