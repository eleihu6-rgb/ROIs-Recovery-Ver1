#include "Period.h"

int Period::GetPeriodUnitSize(const std::string& timePeriodUnit) {
	if (timePeriodUnit == "RH") {
		return 60 * 60; //按时秒数
	}
	else if (timePeriodUnit == "CD") {
		return 24 * 60 * 60; //按天秒数
	}
	return -1;
}