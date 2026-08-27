/**
 * @file CalculateMinRestByDutyPeriodForTGRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-06-26
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CalculateMinRestByDutyPeriodForTGRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/CompositionRule.h"
#include "../utils/SegmentUtils.h"
#include "../constant/Constants.h"

#include "RuleParams.h"

using namespace std;

void CalculateMinRestByDutyPeriodForTGRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::IS_HOME_BASE): {
				_isHomeBase = (substr == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(substr == RuleParamConstant::YES);
				break;
			}
			case enum_to_underlying(ParamLocation::COMPOSITIONS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _compositions);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::DUTY_ASSIGNMENT_GROUPS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _dutyAssignmentGroups);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::DUTY_TYPE): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _dutyTypes);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::SECTORS): {
				_sectorsStr = substr;
				if (substr != RuleParamConstant::ALL) {
					_sectors = stoi(substr);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::SINGLE_BLH_RANGE): {
				_singleBlhRange = substr;
				_singleBlhRangesMinutes.clear();
				if (substr != RuleParamConstant::ALL) {
					vector<string> singleBlhRanges;
					split(substr, '&', singleBlhRanges);
					for (const auto& singleBlhRange : singleBlhRanges) {
						vector<string> splitstrs;
						split(singleBlhRange.c_str(), '-', splitstrs);
						if (splitstrs.size() >= 2) {
							_singleBlhRangesMinutes.emplace_back(
								TimeUtils::hhmmToMinutes(splitstrs[0].c_str()),
								TimeUtils::hhmmToMinutes(splitstrs[1].c_str()));
						}
					}
				}
				break;
			}
			case enum_to_underlying(ParamLocation::DP_RANGES): {
				_strDpRanges = substr;
				if (substr != RuleParamConstant::ALL) {
					vector<string> splitstrs;
					split(substr.c_str(), '-', splitstrs);
					if (splitstrs.size() >= 2) {
						_dpRangesMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
						_dpRangesMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
					}
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MULTIPLIED_TYPE): {
				if (substr != RuleParamConstant::ALL && !substr.empty()) {
					_multipliedType = substr;
				}
				break;
			}
			case enum_to_underlying(ParamLocation::REST_MULTIPLIED): {
				_strRestMultiplied = substr;
				if (substr != RuleParamConstant::ALL && !substr.empty()) {
					_restMultiplied = atof(substr.c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_REST):
				_minRestMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::SEVERITY):
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void CalculateMinRestByDutyPeriodForTGRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//is Home Base(Y/N),Compositions,Duty Assignment Groups,Duty Type,Sectors,Single BLH Range,DP Range,Multiplied Type,Rest Multiplied,Min Rest
		if (header == "IS HOME BASE(Y/N)") {
			_isHomeBase = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "COMPOSITIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _compositions);
			}
		}
		else if (header == "DUTY ASSIGNMENT GROUPS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyAssignmentGroups);
			}
		}
		else if (header == "DUTY TYPE" || header == "DUTY DIR") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyTypes);
			}
		}
		else if (header == "SECTORS") {
			_sectorsStr = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				_sectors = stoi(headeValue);
			}
		}
		else if (header == "SINGLE BLH RANGE") {
			_singleBlhRange = headeValue;
			_singleBlhRangesMinutes.clear();
			if (headeValue != RuleParamConstant::ALL) {
				vector<string> singleBlhRanges;
				split(headeValue, '&', singleBlhRanges);
				for (const auto& singleBlhRange : singleBlhRanges) {
					vector<string> splitstrs;
					split(singleBlhRange.c_str(), '-', splitstrs);
					if (splitstrs.size() >= 2) {
						_singleBlhRangesMinutes.emplace_back(
							TimeUtils::hhmmToMinutes(splitstrs[0].c_str()),
							TimeUtils::hhmmToMinutes(splitstrs[1].c_str()));
					}
				}
			}
		}
		else if (header == "DP RANGES" || header == "DP RANGE") {
			_strDpRanges = headeValue;
			if (headeValue != RuleParamConstant::ALL && !headeValue.empty()) {
				vector<string> splitstrs;
				split(headeValue.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_dpRangesMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_dpRangesMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
			}
		}
		else if (header == "MULTIPLIED TYPE") {
			if (headeValue != RuleParamConstant::ALL && !headeValue.empty()) {
				_multipliedType = headeValue;
			}
		}
		else if (header == "REST MULTIPLIED") {
			_strRestMultiplied = headeValue;
			if (headeValue != RuleParamConstant::ALL && !headeValue.empty()) {
				_restMultiplied = atof(headeValue.c_str());
			}
		}
		else if (header == "MIN REST") {
			_minRestMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//判断是否在基地
bool CalculateMinRestByDutyPeriodForTGRuleParam::MatchHomeBase(const Duty& duty, const std::string& base) const {
	std::string pairingBase;
	if (!base.empty()) {
		// if PO mode, extract the base string from pairing and passed to this predicate
		pairingBase = base;
	}
	else {
		// if editor mode, base is extracted from the segment's pairing
		Pairing* pairing = this->GetRule()->GetDataContext()->pairingIdMap[duty.getPairingId()];
		if (pairing == nullptr) {
			spdlog::error("Pairing({}) do not exist.", duty.getPairingId());
			return true;
		}
		pairingBase = pairing->getBase();
	}
	//MinRest是否在基地，采用Duty的到达机场
	return _isHomeBase == nullptr || BaseUtils::IsHomeBaseByBase(duty.getArrStationRead(), vector<string>(), pairingBase) == *_isHomeBase;
}

bool CalculateMinRestByDutyPeriodForTGRuleParam::MatchComposition(const Duty& duty) const {
	if (_compositions.empty()) {
		return true;
	}
	bool isEditorModel = this->GetRule()->IsEditorModel();
	string compName = duty.getCompositionName();

	//Always recalcuate in editor application
	if (compName.empty() || isEditorModel)
		compName = CompositionRule::GetMinCompositionForRest(const_cast<Duty*>(&duty), this->GetRule()->GetDataContext());

	auto iter = std::find(_compositions.cbegin(), _compositions.cend(), compName);
	return iter != _compositions.cend();
}

bool CalculateMinRestByDutyPeriodForTGRuleParam::MatchDutyAssignmentGroup(const Duty& duty) const {
	if (_dutyAssignmentGroups.empty()) {
		return true;
	}
	const std::shared_ptr<CrewDataContext>& dbData = this->GetRule()->GetDataContext();

	string assignment = duty.getAssignment().empty() ? "FLY" : duty.getAssignment();
	for (auto assigmentGroup : _dutyAssignmentGroups) {
		if (dbData->isAssignmentInGroup(assignment, assigmentGroup)) {
			return true;
		}
	}
	return false;
}

bool CalculateMinRestByDutyPeriodForTGRuleParam::MatchDutyTypes(const Duty& duty) const {
	if (_dutyTypes.empty()) {
		return true;
	}
	auto& segments = duty.getSegmentsRead();
	if (segments.empty()) {
		return true;
	}
	string domIntType = DutyUtils::getDutyType(&duty);
	auto iter = std::find(_dutyTypes.cbegin(), _dutyTypes.cend(), domIntType);
	return iter != _dutyTypes.cend();
}

bool CalculateMinRestByDutyPeriodForTGRuleParam::MatchSectors(const Duty& duty) const {
	if (_sectorsStr.empty() || _sectorsStr == RuleParamConstant::ALL) {
		return true;
	}
	return duty.getSegmentsRead().size() == _sectors;
}

bool CalculateMinRestByDutyPeriodForTGRuleParam::MatchSingleBlhRange(const Duty& duty) const {
	if (_singleBlhRange.empty() || _singleBlhRange == RuleParamConstant::ALL) {
		return true;
	}

	vector<int> segmentBlhsMinutes;
	for (const auto& segment : duty.getSegmentsRead()) {
		segmentBlhsMinutes.push_back(segment->getSchBlkMinutes());
	}

	return SegmentUtils::MatchDistinctSegmentsForRanges(segmentBlhsMinutes, _singleBlhRangesMinutes);
}

bool CalculateMinRestByDutyPeriodForTGRuleParam::MatchDPInRanges(const Duty& duty, const ROSTER* roster) const {
	if (_strDpRanges.empty() || _strDpRanges == RuleParamConstant::ALL) {
		return true; // 未设置DP Ranges，表示适用所有Duty
	}

	int actualDP = DutyUtils::GetDutyActualDP(&duty, roster);
	return (actualDP >= _dpRangesMinutesLower && actualDP < _dpRangesMinutesUpper);
}

int CalculateMinRestByDutyPeriodForTGRuleParam::GetMultipliedValue(const Duty& duty, const ROSTER* roster) const {
	double restMultiplied = 1.0;
	if (!_strRestMultiplied.empty() && _strRestMultiplied != RuleParamConstant::ALL) {
		restMultiplied = this->_restMultiplied;
	}

	if (_multipliedType == "BLH") {
		//// 获取Duty内所有航段的BLH总和
		//int totalBlhMinutes = 0;
		//for (const auto& segment : duty.getSegmentsRead()) {
		//	totalBlhMinutes += segment->getBlkMinutes();
		//}
		int totalBlhMinutes = DutyUtils::GetDutyActualBLH(&duty, roster);
		return static_cast<int>(restMultiplied * totalBlhMinutes);
	}
	else if (_multipliedType == "DP") {
		int actualDP = DutyUtils::GetDutyActualDP(&duty, roster);
		return static_cast<int>(restMultiplied * actualDP);
	}
	else if (_multipliedType == "FDP") {
		int fdp = DutyUtils::GetDutyActualFDP(&duty, roster);
		return static_cast<int>(restMultiplied * fdp);
	}
	return 0;
}

bool CalculateMinRestByDutyPeriodForTGRuleParam::MatchParam(const Duty& duty, const ROSTER* roster, const string& base) const {

	if (!MatchHomeBase(duty, base)) {
		return false;
	}

	if (!MatchComposition(duty)) {
		return false;
	}

	if (!MatchDutyAssignmentGroup(duty)) {
		return false;
	}

	if (!MatchDutyTypes(duty)) {
		return false;
	}

	if (!MatchSectors(duty)) {
		return false;
	}

	if (!MatchSingleBlhRange(duty)) {
		return false;
	}

	// 检查Duty是否在DP Ranges范围内
	if (!MatchDPInRanges(duty, roster)) {
		return false;
	}
	return true;
}

