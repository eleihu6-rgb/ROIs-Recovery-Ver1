/**
 * @file CheckPassportAndVisaForEvaFdRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CheckPassportAndVisaForEvaFdRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/RosterUtils.h"

using namespace std;

void CheckPassportAndVisaForEvaFdRuleParam::ParseParam(const std::string& paramString) {
	std::stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		std::string substr;
		std::getline(ss, substr, delimInParam);
		if (!substr.empty()) {
			switch (i) {
			case enum_to_underlying(ParamLocation::BASES):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _bases);
				}
				break;
			case enum_to_underlying(ParamLocation::RANKS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _ranks);
				}
				break;
			case enum_to_underlying(ParamLocation::FLEETS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _fleets);
				}
				break;
			case enum_to_underlying(ParamLocation::TEAMS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _teams);
				}
				break;
			case enum_to_underlying(ParamLocation::NATIONALITIES):
				if (substr != RuleParamConstant::ALL) {
					if (substr.find("!(") == string::npos) {
						split(substr, '|', _nationalities);
					}
					else {
						string except = substr.substr(2, substr.size() - 3);
						split(except.c_str(), '|', _exceptNationalities);
					}
				}
				break;
			case enum_to_underlying(ParamLocation::QUALIFICATION_OR_CERTIFICATE):
				if (substr != RuleParamConstant::ALL) {
					_qualification = substr;
				}
			case enum_to_underlying(ParamLocation::DAY_ASSIGNMENT_CODE):
				 _dayAssignmentCode = substr;
				break;
			case enum_to_underlying(ParamLocation::GAP_DAYS):
				_gapDays = stoi(substr);
				break;
			case enum_to_underlying(ParamLocation::IS_QUAL_EXPIRED):
				_isQualExpired = (substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(substr == RuleParamConstant::YES);
				break;
			case enum_to_underlying(ParamLocation::PROHIBITED_AIRPORTS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _prohibitedAirports);
				}
				break;
			case enum_to_underlying(ParamLocation::PROHIBITED_COUNTRIES):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _prohibitedCountries);
				}
				break;
			case enum_to_underlying(ParamLocation::PROHIBITED_ASSIGNMENTS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _prohibitedAssignments);
				}
				break;
			case enum_to_underlying(ParamLocation::PROHIBITED_ASSIGNMENT_GROUPS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _prohibitedAssignmentGroups);
				}
				break;
			case enum_to_underlying(ParamLocation::PROHIBITED_LAYOVER_AIRPORTS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _prohibitedLayoverAirports);
				}
				break;
			case enum_to_underlying(ParamLocation::PROHIBITED_LAYOVER_COUNTRIES):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _prohibitedLayoverCountries);
				}
				break;
			case enum_to_underlying(ParamLocation::ONLY_CHECK_LAYOVER):
				_onlyCheckLayover = substr;
				break;
			case enum_to_underlying(ParamLocation::GAP_DAYS_WITHOUT_HOLIDAY):
				_gapDaysWithoutHoliday = substr == "Y";
				break;
			case enum_to_underlying(ParamLocation::HOLIDAY_COUNTRIES):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _holidayCountries);
				}
				break;
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
			}
		}
	}
}

void CheckPassportAndVisaForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "BASES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _bases);
			}
		}
		else if (header == "RANKS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _ranks);
			}
		}
		else if (header == "FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _fleets);
			}
		}
		else if (header == "TEAMS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _teams);
			}
		}
		else if (header == "NATIONALITIES") {
			if (headeValue != RuleParamConstant::ALL) {
				if (headeValue.find("!(") == string::npos) {
					split(headeValue, '|', _nationalities);
				}
				else {
					string except = headeValue.substr(2, headeValue.size() - 3);
					split(except.c_str(), '|', _exceptNationalities);
				}
			}
		}
		else if (header == "QUALIFICATION OR CERTIFICATE") {
			_qualification = headeValue;
		}
		else if (header == "DAY ASSIGNMENT CODE") {
			_dayAssignmentCode = headeValue;
		}
		else if (header == "GAP DAYS") {
			_gapDays = atoi(headeValue.c_str());
		}
		else if (header == "IS EXPIRED(Y/N)") {
			_isQualExpired = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "PROHIBITED COUNTRIES") {
			if (headeValue != RuleParamConstant::ALL) {
				if (headeValue.find("!(") == string::npos) {
					split(headeValue, '|', _prohibitedCountries);
				}
				else {
					string except = headeValue.substr(2, headeValue.size() - 3);
					split(except.c_str(), '|', _exceptProhibitedCountries);
				}
			}
		}
		else if (header == "PROHIBITED AIRPORTS") {
			if (headeValue != RuleParamConstant::ALL) {
				if (headeValue.find("!(") == string::npos) {
					split(headeValue, '|', _prohibitedAirports);
				}
				else {
					string except = headeValue.substr(2, headeValue.size() - 3);
					split(except.c_str(), '|', _exceptProhibitedAirports);
				}
			}
		}
		else if (header == "PROHIBITED ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _prohibitedAssignments);
			}
		}
		else if (header == "PROHIBITED ASSIGNMENT GROUPS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _prohibitedAssignmentGroups);
			}
		}
		else if (header == "ONLY CHECK LAYOVER") {
			_onlyCheckLayover = headeValue;
		}
		else if (header == "PROHIBITED LAYOVER AIRPORTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _prohibitedLayoverAirports);
			}
		}
		else if (header == "PROHIBITED LAYOVER COUNTRIES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _prohibitedLayoverCountries);
			}
		}
		else if (header == "GAP DAYS WITHOUT HOLIDAY") {
			_gapDaysWithoutHoliday = headeValue == "Y";
		}
		else if (header == "HOLIDAY COUNTRIES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _holidayCountries);
			}
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckPassportAndVisaForEvaFdRuleParam::MatchAssignmentCode(const ROSTER* roster) const {
	if (!roster->pairing) {
		return roster->qualifier == _dayAssignmentCode;
	}
	else {
		const auto& pairing = roster->pairing;
		const auto& segments = pairing->getSegmentsRead();
		for (const auto& segment : segments) {
			if (segment->getAssignment() == _dayAssignmentCode)
				return true;
		}
		return false;
	}
}


bool CheckPassportAndVisaForEvaFdRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool CheckPassportAndVisaForEvaFdRuleParam::MatchSegmentParam(const Segment* segment) const {
	string dep = segment->getDepStation();
	string arv = segment->getArrStation();
	const auto& depCountry = this->GetRule()->GetDataContext()->findAirportCountry(dep);
	const auto& arvCountry = this->GetRule()->GetDataContext()->findAirportCountry(arv);
	if (_prohibitedAirports.size() > 0 && _prohibitedAirports[0] != "*" &&
		(find(_prohibitedAirports.begin(), _prohibitedAirports.end(), dep) != _prohibitedAirports.end() || find(_prohibitedAirports.begin(), _prohibitedAirports.end(), arv) != _prohibitedAirports.end()))
		return false;
	if (_exceptProhibitedAirports.size() > 0 && _exceptProhibitedAirports[0] != "*" &&
		(find(_exceptProhibitedAirports.begin(), _exceptProhibitedAirports.end(), dep) == _exceptProhibitedAirports.end() || find(_exceptProhibitedAirports.begin(), _exceptProhibitedAirports.end(), arv) == _exceptProhibitedAirports.end()))
		return false;
	if (_prohibitedCountries.size() > 0 && _prohibitedCountries[0] != "*") {
		if (find(_prohibitedCountries.begin(), _prohibitedCountries.end(), depCountry) != _prohibitedCountries.end() || find(_prohibitedCountries.begin(), _prohibitedCountries.end(), arvCountry) != _prohibitedCountries.end())
			return false;
	}
	if (_exceptProhibitedCountries.size() > 0 && _exceptProhibitedCountries[0] != "*") {
		if (find(_exceptProhibitedCountries.begin(), _exceptProhibitedCountries.end(), depCountry) == _exceptProhibitedCountries.end() || find(_exceptProhibitedCountries.begin(), _exceptProhibitedCountries.end(), arvCountry) == _exceptProhibitedCountries.end())
			return false;
	}
	if ((_prohibitedCountries.size() == 0 || _prohibitedCountries[0] == "*") && (_prohibitedAirports.size() == 0 || _prohibitedAirports[0] == "*") && (_exceptProhibitedAirports.size() == 0 || _exceptProhibitedAirports[0] == "*")
		&& (_exceptProhibitedCountries.size() == 0 || _exceptProhibitedCountries[0] == "*"))
		return false;
	
	return true;
}

bool CheckPassportAndVisaForEvaFdRuleParam::MatchAssignmentParam(const std::string assignment) const {

	if (_prohibitedAssignments.size() > 0 && _prohibitedAssignments[0] != "*" && find(_prohibitedAssignments.begin(), _prohibitedAssignments.end(), assignment) != _prohibitedAssignments.end())
		return false;
	if (_prohibitedAssignmentGroups.size() > 0 && _prohibitedAssignmentGroups[0] != "*") {
		for (const auto& group : _prohibitedAssignmentGroups) {
			if (this->GetRule()->GetDataContext()->isAssignmentInGroup(assignment, group))
				return false;
		}
	}
	return true;
}

bool CheckPassportAndVisaForEvaFdRuleParam::MatchLayoverParam(const Pairing* pairing) const {
	const auto& duties = pairing->getDutyVec();
	if (duties.size() < 2 || _onlyCheckLayover == "*")
		return true;
	if (duties.size() >=2 && _onlyCheckLayover == "Y") {
		return false;
	}
	for (size_t i = 0; i < duties.size() - 1; i++) {
		string layoverStation = duties[i]->getArrStation();
		if (_prohibitedLayoverAirports.size() > 0 && _prohibitedLayoverAirports[0] != "*" && find(_prohibitedLayoverAirports.begin(), _prohibitedLayoverAirports.end(), layoverStation) != _prohibitedLayoverAirports.end())
			return false;

		const auto& layoverCountry = this->GetRule()->GetDataContext()->findAirportCountry(layoverStation);
		if (find(_prohibitedLayoverCountries.begin(), _prohibitedLayoverCountries.end(), layoverCountry) != _prohibitedLayoverCountries.end())
			return false;
	}
	return true;
}

bool CheckPassportAndVisaForEvaFdRuleParam::MatchQualExpiredParam(const bool isQualExpired) const {
	//this->_isQualExpired == nullptr, 未配置 - 表示资质无能过期和未过期都不能在Gap Days安排任务
	return *(this->_isQualExpired) == isQualExpired;
}
