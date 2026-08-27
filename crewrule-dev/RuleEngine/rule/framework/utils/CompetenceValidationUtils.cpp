#include "CompetenceValidationUtils.h"

#include <limits>
#include "UtilFunc.h"

bool CompetenceValidationUtils::IsValid(const std::shared_ptr<CREW_STATUS>& status, const time_t checkedStartTimeUtc, const time_t checkedEndTimeUtc) {
	time_t INVALID_TIME = utcStrToUtc("9999-12-31");
	time_t effUtc = (status->effDt == INVALID_TIME) ? INT_MIN : status->effDt;
	time_t expUtc = (status->expdt == INVALID_TIME) ? INT_MAX : status->expdt;
	return (checkedStartTimeUtc >= effUtc && checkedEndTimeUtc < expUtc);
}

//机组人员级别合法性检查
bool CompetenceValidationUtils::IsValid(const std::shared_ptr<CREW_RANK>& rank, const time_t checkedStartTimeUtc, const time_t checkedEndTimeUtc) {
	time_t INVALID_TIME = utcStrToUtc("9999-12-31");
	time_t effUtc = (rank->effUtc == INVALID_TIME) ? INT_MIN : rank->effUtc;
	time_t expUtc = (rank->expUtc == INVALID_TIME) ? INT_MAX : rank->expUtc;
	return (checkedStartTimeUtc >= effUtc && checkedEndTimeUtc < expUtc);
}

//机组人员公司级别合法性检查
bool CompetenceValidationUtils::IsValid(const std::shared_ptr<CREW_COMPANY_RANK>& companyRank, const time_t checkedStartTimeUtc, const time_t checkedEndTimeUtc) {
	time_t INVALID_TIME = utcStrToUtc("9999-12-31");//timestamp: 253402214400
	time_t effUtc = (companyRank->effDt == INVALID_TIME) ? INT_MIN : companyRank->effDt;
	time_t expUtc = (companyRank->expDt == INVALID_TIME) ? INT_MAX : companyRank->expDt;
	return (checkedStartTimeUtc >= effUtc && checkedEndTimeUtc < expUtc);
}

//机组人员资质合法性检查
bool CompetenceValidationUtils::IsValid(const std::shared_ptr<CREW_QUALIFICATION>& qual, const time_t checkedStartTimeUtc, const time_t checkedEndTimeUtc) {
	if (!qual->isValid) {
		return false;
	}
	time_t INVALID_TIME = utcStrToUtc("9999-12-31");
	time_t effUtc = (qual->issuedUtc == INVALID_TIME) ? INT_MIN : qual->issuedUtc;
	time_t expUtc = (qual->expiryUtc == INVALID_TIME) ? INT_MAX : qual->expiryUtc;

	//CMSCEB-207 复训不生成新的资质
	if (qual->expiryUtc != INVALID_TIME && qual->projectionExpiryDate != INVALID_TIME) {
		expUtc = max(qual->expiryUtc, qual->projectionExpiryDate);
	}
	//CMSCEB-207 复训生成新的资质，但是expiry为空
	else if (qual->expiryUtc == INVALID_TIME && qual->projectionExpiryDate != INVALID_TIME) {
		expUtc = qual->projectionExpiryDate;
	}

	return (checkedStartTimeUtc >= effUtc && checkedEndTimeUtc < expUtc);
}