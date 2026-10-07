import { Box, Skeleton, Typography } from "@mui/material";
export default function Loading() {
  return (
    <Box role="status" aria-live="polite">
      <Typography sx={{ mb: 2 }}>Getting your workspace ready…</Typography>
      <Skeleton variant="rounded" height={160} sx={{ mb: 3 }} />
      <Box
        sx={{
          display: "grid",
          gap: 3,
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
        }}
      >
        {[1, 2].map((n) => (
          <Skeleton key={n} variant="rounded" height={240} />
        ))}
      </Box>
    </Box>
  );
}
