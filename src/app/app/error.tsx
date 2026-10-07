"use client";
import { Alert, Box, Button, Typography } from "@mui/material";
export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <Box sx={{ py: 5, maxWidth: 600 }}>
      <Typography variant="h2">
        We couldn’t load this part of your workspace.
      </Typography>
      <Alert severity="error" sx={{ my: 3 }}>
        Please try again. If you were saving changes, check the record before
        submitting it again.
      </Alert>
      <Button onClick={reset} variant="contained">
        Try again
      </Button>
    </Box>
  );
}
