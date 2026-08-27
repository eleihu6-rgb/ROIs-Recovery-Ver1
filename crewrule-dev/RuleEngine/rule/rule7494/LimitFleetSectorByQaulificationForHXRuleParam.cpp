/**
 * @file LimitFleetSectorByQaulificationForHXRuleParam.cpp
 * @brief
**/

#include <sstream>
#include "spdlog/spdlog.h"
#include "LimitFleetSectorByQaulificationForHXRuleParam.h"
#include "Utility.h"
#include "UtilFunc.h"
#include "../constant/Constants.h"
#include "RuleParams.h"

using namespace std;

namespace {

string normalizeUpperTrim7494Param(const string& value) {
	string tmp = value;
	return strToUpper(trim(tmp));
}

void parseMultiValue7494(const string& raw, vector<string>& out) {
	vector<string> values;
	split(raw, '|', values);
	for (auto& value : values) {
		string normalized = normalizeUpperTrim7494Param(value);
		if (!normalized.empty()) {
			out.emplace_back(normalized);
		}
	}
}

}

void LimitFleetSectorByQaulificationForHXRuleParam::ParseParam(const std::string& paramString) {
	std::stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		std::string substr;
		std::getline(ss, substr, delimInParam);
		if (substr.empty()) {
			continue;
		}

		switch (i) {
		case enum_to_underlying(ParamLocation::BASES):
			if (normalizeUpperTrim7494Param(substr) != RuleParamConstant::ALL) {
				parseMultiValue7494(substr, _bases);
			}
			break;
		case enum_to_underlying(ParamLocation::RANKS):
			if (normalizeUpperTrim7494Param(substr) != RuleParamConstant::ALL) {
				parseMultiValue7494(substr, _ranks);
			}
			break;
		case enum_to_underlying(ParamLocation::FLEETS):
			if (normalizeUpperTrim7494Param(substr) != RuleParamConstant::ALL) {
				parseMultiValue7494(substr, _fleets);
			}
			break;
		case enum_to_underlying(ParamLocation::TEAMS):
			if (normalizeUpperTrim7494Param(substr) != RuleParamConstant::ALL) {
				parseMultiValue7494(substr, _teams);
			}
			break;
		case enum_to_underlying(ParamLocation::QUALIFICATIONS):
			if (normalizeUpperTrim7494Param(substr) != RuleParamConstant::ALL) {
				parseMultiValue7494(substr, _qualifications);
			}
			break;
		case enum_to_underlying(ParamLocation::AFTER_QUAL_EFFDT_DAYS):
			_afterQualEffDtDays = atoi(trim(substr).c_str());
			break;
		case enum_to_underlying(ParamLocation::FLIGHT_FLEETS):
			if (normalizeUpperTrim7494Param(substr) != RuleParamConstant::ALL) {
				parseMultiValue7494(substr, _flightFleets);
			}
			break;
		case enum_to_underlying(ParamLocation::MIN_FLY_SECTORS):
			_minFlySectors = atoi(trim(substr).c_str());
			break;
		default:
			Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
			break;
		}
	}
}

void LimitFleetSectorByQaulificationForHXRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	for (auto iter = parameter.begin(); iter != parameter.end(); ++iter) {
		const string header = normalizeUpperTrim7494Param(iter->first);
		const string value = trim(iter->second);
		const string upperValue = normalizeUpperTrim7494Param(iter->second);

		if (header == "BASES") {
			if (!value.empty() && upperValue != RuleParamConstant::ALL) {
				parseMultiValue7494(value, _bases);
			}
		}
		else if (header == "RANKS") {
			if (!value.empty() && upperValue != RuleParamConstant::ALL) {
				parseMultiValue7494(value, _ranks);
			}
		}
		else if (header == "FLEET") {
			if (!value.empty() && upperValue != RuleParamConstant::ALL) {
				parseMultiValue7494(value, _fleets);
			}
		}
		else if (header == "CREW TEAMS") {
			if (!value.empty() && upperValue != RuleParamConstant::ALL) {
				parseMultiValue7494(value, _teams);
			}
		}
		else if (header == "QUALIFICATIONS") {
			if (!value.empty() && upperValue != RuleParamConstant::ALL) {
				parseMultiValue7494(value, _qualifications);
			}
		}
		else if (header == "AFTER QUAL EFFDT DAYS") {
			_afterQualEffDtDays = atoi(trim(value).c_str());
		}
		else if (header == "FLIGHT FLEETS") {
			if (!value.empty() && upperValue != RuleParamConstant::ALL) {
				parseMultiValue7494(value, _flightFleets);
			}
		}
		else if (header == "MIN FLY SECTORS") {
			_minFlySectors = atoi(trim(value).c_str());
		}
		else {
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
		}
	}
}

bool LimitFleetSectorByQaulificationForHXRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	return Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime);
}

bool LimitFleetSectorByQaulificationForHXRuleParam::MatchQualification(const std::shared_ptr<CREW_QUALIFICATION>& qual) const {
	if (qual == nullptr || !qual->isValid) {
		return false;
	}
	if (_qualifications.empty()) {
		return true;
	}
	const string qualUpper = normalizeUpperTrim7494Param(qual->qual);
	return std::find(_qualifications.begin(), _qualifications.end(), qualUpper) != _qualifications.end();
}

bool LimitFleetSectorByQaulificationForHXRuleParam::MatchFleet(const std::string& fleet) const {
	if (_flightFleets.empty()) {
		return true;
	}
	const string fleetUpper = normalizeUpperTrim7494Param(fleet);
	return std::find(_flightFleets.begin(), _flightFleets.end(), fleetUpper) != _flightFleets.end();
}
