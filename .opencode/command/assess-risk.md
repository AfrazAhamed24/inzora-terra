---
description: Run risk assessment only
agent: risk-assessment
---

# Assess Risk Command

## Usage
/assess-risk <zone>

## Arguments
- zone: building zone to assess (e.g., A1, B2)

## Example
/assess-risk A1

## What Happens
1. Risk Assessment Agent receives zone
2. Gathers sensor data
3. Gathers weather data
4. Gathers building info
5. Calculates risk score
6. Outputs risk report
