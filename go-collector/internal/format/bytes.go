package format

import (
	"fmt"
	"math"
)

func FormatBytes(bytes uint64) string {
	if bytes <= 0 {
		return "0 B"
	}
	units := []string{"B", "KB", "MB", "GB", "TB"}
	i := int(math.Floor(math.Log(float64(bytes)) / math.Log(1024)))
	if i < 0 {
		i = 0
	}
	if i >= len(units) {
		i = len(units) - 1
	}
	value := float64(bytes) / math.Pow(1024, float64(i))
	return fmt.Sprintf("%.2f %s", value, units[i])
}
