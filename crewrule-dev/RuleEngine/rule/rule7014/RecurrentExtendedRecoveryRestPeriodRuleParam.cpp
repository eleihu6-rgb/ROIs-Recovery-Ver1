#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "RecurrentExtendedRecoveryRestPeriodRuleParam.h"
#include "CrewDB.h"
#include "utils/DutyUtils.h"

using namespace std;

void RecurrentExtendedRecoveryRestPeriodRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		this->SetId(dbRule.idRule);
		this->SetRuleParamId(dbRule.idRuleParam);
		this->SetPhase(dbRule.phase);
		this->SetDescription(dbRule.description);
		header = iter->first;
		headeValue = iter->second;

		if (header == "RERRP MIN REST")
			_rerrpMinRest = stoi(headeValue.substr(0, headeValue.find(":"))) * 60 + stoi(headeValue.substr(headeValue.find(":") + 1));
		else if (header == "RERRP NO OF LNS")
			_rerrpNoOfLns = atoi(headeValue.c_str());
		else if (header == "MAX SPAN BETWEEN RERRPS")
			_maxSpanBetweenRerrps = stoi(headeValue.substr(0, headeValue.find(":"))) * 60 + stoi(headeValue.substr(headeValue.find(":") + 1));
		else if (header == "RERRP MIN LOCAL DAYS")
			_rerrpMinLocalDays = atoi(headeValue.c_str());
		else if (header == "RERRP ASSIGNMENTS")
			split(headeValue, '|', _rerrpAssignments);
		else if (header == "RERRP ASSIGNMENT GROUPS")
			split(headeValue, '|', _rerrpAssignmentGroups);
		else if (header == "IS COUNT BLANK DAY")
			_isCountBlankDay = headeValue == "Y";
		else if (header == "UNIT")
			_unit = headeValue;
		else if (header == "PERIOD")
			_period = atoi(headeValue.c_str());
		else if (header == "MIN RERRP NUM")
			_minRerrpNum = atoi(headeValue.c_str());

	}
}

bool RecurrentExtendedRecoveryRestPeriodRuleParam::IsRERRP(time_t startTime, time_t endTime) const {
	bool result = true;
	if (endTime - startTime < _rerrpMinRest * 60)
		result = false;
	if (DutyUtils::GetLocalNightNums(startTime, endTime) < _rerrpNoOfLns)
		result = false;
	return result;
}

bool RecurrentExtendedRecoveryRestPeriodRuleParam::MatchMinLocalDays(time_t startTime, time_t endTime) const {
	if (_rerrpMinLocalDays <= 0)
		return true;

	time_t nextLocalDayStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(startTime, 0);
	if (nextLocalDayStart < startTime)
		nextLocalDayStart += 24 * 3600;
	const int localDayNums = endTime > nextLocalDayStart ?
		static_cast<int>((endTime - nextLocalDayStart) / (24 * 3600)) : 0;
	return localDayNums >= _rerrpMinLocalDays;
}

bool RecurrentExtendedRecoveryRestPeriodRuleParam::DurationOfRerrps(time_t lastEndTime, time_t nextStartTime) const {
	return nextStartTime - lastEndTime <= _maxSpanBetweenRerrps * 60;
}

bool RecurrentExtendedRecoveryRestPeriodRuleParam::MatchAssignment(const std::string& assignment) const {
	if (!_rerrpAssignments.empty() && _rerrpAssignments[0] != "*" && find(_rerrpAssignments.begin(), _rerrpAssignments.end(), assignment) == _rerrpAssignments.end())
		return false;

	if (!_rerrpAssignmentGroups.empty() && _rerrpAssignmentGroups[0] != "*" && !this->GetRule()->GetDataContext()->isAssignmentInGroup(assignment, _rerrpAssignmentGroups)) {
		return false;		
	}

	return true;
}
