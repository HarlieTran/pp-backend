# ──────────────────────────────────────────────
# RDS PostgreSQL for PantryPal
# ──────────────────────────────────────────────

# Use the default VPC (every AWS account has one)
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Security group — allows PostgreSQL inbound
resource "aws_security_group" "rds" {
  name        = "pp-backend-rds-sg"
  description = "Allow PostgreSQL inbound for PantryPal"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "PostgreSQL from anywhere (dev)"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "pp-backend-rds-sg"
  }
}

# DB subnet group (uses default VPC subnets)
resource "aws_db_subnet_group" "main" {
  name       = "pp-backend-db-subnet"
  subnet_ids = data.aws_subnets.default.ids

  tags = {
    Name = "pp-backend-db-subnet"
  }
}

# RDS PostgreSQL instance
resource "aws_db_instance" "main" {
  identifier     = "pp-backend-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = "db.t3.micro"

  allocated_storage = 20
  storage_type      = "gp3"

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = true
  skip_final_snapshot    = true

  backup_retention_period = 0  # 0 for free tier (set to 7 for production)
  storage_encrypted       = true

  tags = {
    Name = "pp-backend-db"
  }
}
