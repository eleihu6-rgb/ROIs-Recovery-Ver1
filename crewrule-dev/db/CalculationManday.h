#ifndef CALCULATION_MANDAY_H
#define CALCULATION_MANDAY_H
#include <string>

//------------- Calculation_Manday ---------------
struct CalculationManday {
	std::string airline;
	std::string type;
	std::string str; //开始日期类型，取值：SCH - 计划时间， ACT - 实际时间
	std::string end; //结束日期类型，取值：SCH - 计划时间， ACT - 实际时间
};

#endif//CALCULATION_MANDAY_H