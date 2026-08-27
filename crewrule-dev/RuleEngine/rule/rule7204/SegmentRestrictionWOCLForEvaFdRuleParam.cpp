/**
 * @file SegmentRestrictionWOCLForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "SegmentRestrictionWOCLForEvaFdRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"

using namespace std;

void SegmentRestrictionWOCLForEvaFdRuleParam::ParseParam(const std::string &paramString) {
	assert(false);
}

void SegmentRestrictionWOCLForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	if (dbRule.tableNum == 1) {
		_segmentRestrictionDayNightForEvaFdRuleParams.emplace_back(SegmentRestrictionDayNightForEvaFdRuleParam(this->GetRule()));
		auto& newParam = _segmentRestrictionDayNightForEvaFdRuleParams.back();
		newParam.ParseParam(dbRule);
	}
	else {
		_segmentRestrictionFDPNightForEvaFdRuleParams.emplace_back(SegmentRestrictionFDPNightForEvaFdRuleParam(this->GetRule()));
		auto& newParam = _segmentRestrictionFDPNightForEvaFdRuleParams.back();
		newParam.ParseParam(dbRule);
	}
}
