/**
 * @file PairingPerDiemHoursForEvaFdRuleParam.h
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
#include "PairingPerDiemHoursForEvaFdRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"

using namespace std;

void PairingPerDiemHoursForEvaFdRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::PAIRING_ASSIGNMENT_GROUPS): {
				_pairingAssignmentGroups = substr;
				_pairingAssignmentGroupsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::DUTY_ASSIGNMENTS): {
				_dutyAssignments = substr;
				_dutyAssignmentsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::NUMBER_RANGE_OF_SEGMENT_IN_DUTY): {
				_numRangeOfSegment = substr;
				_numRangeOfSegmentMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::PER_DIEM): {
				_perDiemExpression = substr;
				if (isHHmm(substr.c_str())) {
					_perDiemExpressionMinutes = std::make_shared<int>(TimeUtils::hhmmToMinutes(substr));
				}
				break;
			}
			case enum_to_underlying(ParamLocation::PER_DIEM_GAP): {
				_perDiemGap = substr;
				_perDiemGapMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::DELAY_BUFFER): {
				_perDiemDelayBuffer = substr;
				_perDiemDelayBufferMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::SEVERITY):
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void PairingPerDiemHoursForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Pairing Assignment Groups,Duty Assignments,Number Range of Segment in Duty,Per Diem,Per Diem Gap,Delay Buffer
		if (header == "PAIRING ASSIGNMENT GROUPS") {
			_pairingAssignmentGroups = headeValue;
			_pairingAssignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "DUTY ASSIGNMENTS") {
			_dutyAssignments = headeValue;
			_dutyAssignmentsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "NUMBER RANGE OF SEGMENT IN DUTY") {
			_numRangeOfSegment = headeValue;
			_numRangeOfSegmentMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "PER DIEM") {
			_perDiemExpression = headeValue;
			if (isHHmm(headeValue.c_str())) {
				_perDiemExpressionMinutes = std::make_shared<int>(TimeUtils::hhmmToMinutes(headeValue));
			}
		}
		else if (header == "PER DIEM GAP") {
			_perDiemGap = headeValue;
			_perDiemGapMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "DELAY BUFFER") {
			_perDiemDelayBuffer = headeValue;
			_perDiemDelayBufferMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			spdlog::critical("Rule Param parsing error at rule:{0:>5}, cannot parse header:{}", 0 + RuleFuncId, header);
	}
}

bool PairingPerDiemHoursForEvaFdRuleParam::MatchParam(const Pairing* pairing, const Duty* duty) const {
	if (!_pairingAssignmentGroupsMatch.Match(*pairing)) {
		return false;
	}

	if (!_dutyAssignmentsMatch.Match(*duty)) {
		return false;
	}

	if (!_numRangeOfSegmentMatch.Match((int)duty->getSegments().size())) {
		return false;
	}
	return true;
}
