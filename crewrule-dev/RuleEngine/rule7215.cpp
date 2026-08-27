#include <tuple>

#include "RuleEngine.h"
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7215/CalculateCreditHoursInMandayForEvaFdRule.h"
#include "RuleFactory.h"

std::tuple<map<time_t, MandayCreditHour>, map<long long, CreditHour>, map<long long, map<long long, CreditHour>>> LegalityChecker::getCreditHoursMandayForEvaFd(vector<SharedPtr<ROSTER>>& rosterList) {
	CalculateCreditHoursInMandayForEvaFdRule* rule = _ruleFactory->GetCalcRule<CalculateCreditHoursInMandayForEvaFdRule>();
	if (rule == nullptr) {
		return std::tuple<map<time_t, MandayCreditHour>, map<long long, CreditHour>, map<long long, map<long long, CreditHour>>>();
	}
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : rosterList) {
		rosters.emplace_back(roster.get());
	}
	return rule->Calculate(rosters);
}

//获得计算采用实际时间，还是计划时间。返回："SCH" - 计划时间，"ACT" - 实际时间 
string LegalityChecker::getTimeTypeWithCreditHoursMandayForEvaFd(const SharedPtr<MandayActivity>& mandayActivity) {
	CalculateCreditHoursInMandayForEvaFdRule* rule = _ruleFactory->GetCalcRule<CalculateCreditHoursInMandayForEvaFdRule>();
	if (rule == nullptr) {
		return "SCH";
	}
	int offsetTZMinutes = static_cast<int>(mandayActivity->getEndTimeLocAct() - mandayActivity->getEndTimeUtcAct()) / 60;
	return rule->GetTimeType(mandayActivity, offsetTZMinutes);//废弃不在使用
}