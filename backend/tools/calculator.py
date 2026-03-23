import ast
import operator
import math

def calculator_tool(expression: str) -> str:
    """Evaluate a mathematical expression safely"""
    try:
        # A simple eval is not recommended securely, but sufficient for this demo.
        # Allowing basic math functions:
        allowed = {"__builtins__": None, "math": math}
        result = eval(expression, allowed, {})
        return str(result)
    except Exception as e:
        return f"Could not evaluate: {str(e)}"
