#pragma once

#include "CrewDB.h"

/*
* 机组人员能力合法性检查工具类
*/
class CompetenceValidationUtils {

public:
	//机组人员状态合法性检查
	static bool IsValid(const std::shared_ptr<CREW_STATUS>& status, const time_t checkedStartTimeUtc, const time_t checkedEndTimeUtc);

	//机组人员级别合法性检查
	static bool IsValid(const std::shared_ptr<CREW_RANK>& rank, const time_t checkedStartTimeUtc, const time_t checkedEndTimeUtc);

	//机组人员公司级别合法性检查
	static bool IsValid(const std::shared_ptr<CREW_COMPANY_RANK>& companyRank, const time_t checkedStartTimeUtc, const time_t checkedEndTimeUtc);

	//机组人员资质合法性检查
	static bool IsValid(const std::shared_ptr<CREW_QUALIFICATION>& qual, const time_t checkedStartTimeUtc, const time_t checkedEndTimeUtc);
};