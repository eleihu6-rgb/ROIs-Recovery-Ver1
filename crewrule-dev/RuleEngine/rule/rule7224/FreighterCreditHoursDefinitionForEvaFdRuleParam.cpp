/**
 * @file FreighterCreditHoursDefinitionForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include <climits>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "FreighterCreditHoursDefinitionForEvaFdRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"

using namespace std;

void FreighterCreditHoursDefinitionForEvaFdRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::TEAMS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _teams);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ASSIGNMENT_GROUPS): {
				_assignmentGroups = substr;
				_assignmentGroupsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::ASSIGNMENTS): {
				_assignments = substr;
				_assignmentMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::SEGMENT_FLEETS): {
				_segmentFleets = substr;
				_segmentFleetsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::SEGMENT_FROM_DEP_TO_ARR): {
				_segFromDepToArr = substr;
				
				vector<string> tmpSegFromDepToArrs;
				split(_segFromDepToArr, '|', tmpSegFromDepToArrs);
				for (auto& tmpSegFromDepToArr : tmpSegFromDepToArrs) {

					vector<string> splitstrs;
					split(tmpSegFromDepToArr, '-', splitstrs);
					if (splitstrs.size() >= 2) {
						this->_segDeps.emplace_back(splitstrs[0]);
						this->_segArrs.emplace_back(splitstrs[1]);
					}
				}
				break;
			}
			case enum_to_underlying(ParamLocation::NUMBER_RANGE_OF_SEGMENT_IN_DUTY): {
				_numRangeOfSegment = substr;
				_numRangeOfSegmentMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::IP_CK_CHIEF_PILOT_CREDIT): {
				_tmCreditFlag = (substr == "*") ? nullptr : std::make_unique<bool>(substr == "Y");
				_tmCreditFlagMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::FOOTPRINT_TYPE): {
				_footprintTypes = substr;
				_footprintTypesMatch.SetExpression(strToUpper(substr), this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::COURSE_CODE): {
				_courseCodes = substr;
				_courseCodeMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::EXTRA_COURSE): {
				_isExtraCourse = substr;
				_isExtraCourseMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::ROLE): {
				_trainRoles = substr;
				_trainingRoleMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::IP_CK_QUAL): {
				_IPOrCKQuals = substr;
				_IPOrCKQualMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::CHIEF_PILOT_RANK): {
				_chiefPilotRanks = substr;
				_chiefPilotRankMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::CREDIT): {
				_creditExpression = substr;
				break;
			}
			case enum_to_underlying(ParamLocation::CREDIT_BT_GAP): {
				_creditBtGap = substr;
				_creditBtGapMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::PERCENT): {
				_creditPercent = StringUtils::stod(substr, 0);
				break;
			}
			case enum_to_underlying(ParamLocation::DELAY_BUFFER): {
				_creditDelayBuffer = substr;
				_creditDelayBufferMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::MULTIPLE): {
				_creditMultiple = StringUtils::stod(substr, 0);
				break;
			}
			case enum_to_underlying(ParamLocation::SPLIT_METHOD): {
				_splitMethod = substr;
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

void FreighterCreditHoursDefinitionForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Teams,Assignment Groups,Assignments,Segment Fleets,Segment from Departure to Arrival,Number Range of Segment in Duty,IP/CK&Chief Pilot Credit,Footprint Types,Course Code,Extra Course(Y/N),Role(Trainer/Trainee),IP/CK QUAL,Chief Pilot Rank,Credit,Credit BT Gap,Percent,Delay Buffer,Multiple,Split Method(SPAN/START)
		if (header == "TEAMS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _teams);
			}
		}
		else if (header == "ASSIGNMENT GROUPS") {
			_assignmentGroups = headeValue;
			_assignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "ASSIGNMENTS") {
			_assignments = headeValue;
			_assignmentMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "SEGMENT FLEETS") {
			_segmentFleets = headeValue;
			_segmentFleetsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "SEGMENT FROM DEPARTURE TO ARRIVAL") {
			_segFromDepToArr = headeValue;

			vector<string> tmpSegFromDepToArrs;
			split(_segFromDepToArr, '|', tmpSegFromDepToArrs);
			for (auto& tmpSegFromDepToArr : tmpSegFromDepToArrs) {

				vector<string> splitstrs;
				split(tmpSegFromDepToArr, '-', splitstrs);
				if (splitstrs.size() >= 2) {
					this->_segDeps.emplace_back(splitstrs[0]);
					this->_segArrs.emplace_back(splitstrs[1]);
				}
			}
		}
		else if (header == "NUMBER RANGE OF SEGMENT IN DUTY") {
			_numRangeOfSegment = headeValue;
			_numRangeOfSegmentMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "IP/CK&CHIEF PILOT CREDIT") {
			_tmCreditFlag = (headeValue == "*") ? nullptr : std::make_unique<bool>(headeValue == "Y");
			_tmCreditFlagMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "FOOTPRINT TYPES") {
			_footprintTypes = headeValue;
			_footprintTypesMatch.SetExpression(strToUpper(headeValue), this->GetRule());
		}
		else if (header == "COURSE CODE") {
			_courseCodes = headeValue;
			_courseCodeMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "EXTRA COURSE(Y/N)") {
			_isExtraCourse = headeValue;
			_isExtraCourseMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "ROLE(TRAINER/TRAINEE)") {
			_trainRoles = headeValue;
			_trainingRoleMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "IP/CK QUAL") {
			_IPOrCKQuals = headeValue;
			_IPOrCKQualMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "CHIEF PILOT RANK") {
			_chiefPilotRanks = headeValue;
			_chiefPilotRankMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "CREDIT") {
			_creditExpression = headeValue;
		}
		else if (header == "CREDIT BT GAP") {
			_creditBtGap = headeValue;
			_creditBtGapMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "PERCENT") {
			_creditPercent = StringUtils::stod(headeValue, 0);
		}
		else if (header == "DELAY BUFFER") {
			_creditDelayBuffer = headeValue;
			_creditDelayBufferMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "MULTIPLE") {
			_creditMultiple = StringUtils::stod(headeValue, 0);
		}
		else if (header == "SPLIT METHOD(SPAN/START)") {
			_splitMethod = headeValue;
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			spdlog::critical("Rule Param parsing error at rule:{0:>5}, cannot parse header:{}", 0 + RuleFuncId, header);
	}
}


//匹配航段的出发地点和到达地点
bool FreighterCreditHoursDefinitionForEvaFdRuleParam::MatchSegmentFromDepToArr(const Segment* segment) const {
	if (segment == nullptr || _segFromDepToArr == RuleParamConstant::ALL || _segFromDepToArr.empty()) {
		return true;
	}
	for (size_t i = 0; i < _segDeps.size(); i++) {
		auto& dep = _segDeps.at(i);
		if (i >= _segArrs.size()) {
			continue;
		}
		auto& arr = _segArrs.at(i);
		if (segment->getDepStationRead() == dep && segment->getArrStationRead() == arr) {
			return true;
		}
	}
	return false;
}

bool FreighterCreditHoursDefinitionForEvaFdRuleParam::MatchFootprintTypeAndExtraCourse(const ROSTER& roster, const Segment* segment, const int offsetTZMinutes) const {
	auto& dbData = this->GetRule()->GetDataContext();

	//仅针对crew学员进行检查
	auto tmProgramCourse = dbData->tmProgramCourseIndex->getByRosterId(roster.rosterId, segment->getDBId());
	if (tmProgramCourse == nullptr) {
		//当前crew是教员或者不是培训课程，则返回true
		return true;
	}

	if (!MatchFootprintTypeAndExtraCourse(tmProgramCourse, segment, offsetTZMinutes)) {
		return false;
	}
	return true;
}

bool FreighterCreditHoursDefinitionForEvaFdRuleParam::MatchFootprintTypeAndExtraCourse(const std::shared_ptr<TmProgramCourse>& teProgramCourse, const Segment* segment, const int offsetTZMinutes) const {
	auto& dbData = this->GetRule()->GetDataContext();

	if (!_isExtraCourseMatch.Match(teProgramCourse->isExtraCourse)) {
		return false;
	}

	const auto program = dbData->tmProgramIndex->getById(teProgramCourse->programId);
	if (program == nullptr) {
		Logger::getRuleLogger()->error("[MatchFootprintTypeAndExtraCourse] program is null. programCourseId={}, programId={}", teProgramCourse->id, teProgramCourse->programId);
		return false;
	}

	auto tmFootprint = dbData->tmFootprintIndex->getById(program->footprintId);
	if (tmFootprint != nullptr && !_footprintTypesMatch.Match(tmFootprint->footprintType)) {
		return false;
	}
	return true;
}

bool FreighterCreditHoursDefinitionForEvaFdRuleParam::MatchFootprintTypeAndFirstDutyDate(const ROSTER& roster, const Segment* segment, const vector<std::shared_ptr<TmProgram>>& allProgramList, const int offsetTZMinutes) const {
	if (_footprintTypes == RuleParamConstant::IGNORED) {
		return true;
	}
	auto& dbData = this->GetRule()->GetDataContext();

	time_t maxFirstDutyDate = 0;
	for (auto& program : allProgramList) {
		auto tmFootprint = dbData->tmFootprintIndex->getById(program->footprintId);
		if (tmFootprint != nullptr && _footprintTypesMatch.Match(tmFootprint->footprintType)) {
			time_t programFirstDutyDate = (program->firstDutyDate > 0 ? program->firstDutyDate : INT_MAX);
			maxFirstDutyDate = (programFirstDutyDate > maxFirstDutyDate) ? programFirstDutyDate : maxFirstDutyDate;
		}
	}
	time_t segmentStartTimeLoc = segment->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60;
	if (segment != nullptr && segmentStartTimeLoc >= maxFirstDutyDate) {
		return false;
	}
	return true;
}

//匹配参数
bool FreighterCreditHoursDefinitionForEvaFdRuleParam::MatchParam(const ROSTER* roster, const Duty* duty, const Segment* segment, const vector<std::shared_ptr<TmProgram>>& allProgramList, const int offsetTZMinutes) const {

	if (segment != nullptr && !_segmentFleetsMatch.Match(segment->getFleetCD())) {
		return false;
	}

	if (!roster->isValidTeam(_teams)) {
		return false;
	}

	if (!_assignmentGroupsMatch.Match(*roster)) {
		return false;
	}

	//飞行任务使用Segment.Assigment来匹配该参数，地面任务使用GroundRoster.Assignment来匹配该参数
	bool matched = (segment == nullptr) ? _assignmentMatch.Match(*roster) : _assignmentMatch.Match(*segment);
	if (!matched) {
		return false;
	}

	if (!MatchSegmentFromDepToArr(segment)) {
		return false;
	}

	if (duty != nullptr && !_numRangeOfSegmentMatch.Match((int)duty->getSegments().size())) {
		return false;
	}

	vector<long long> flightIds;
	if (segment != nullptr) {
		flightIds.emplace_back(segment->getDBId());
	}

	if (!_tmCreditFlagMatch.Match(*roster, flightIds)) {
		return false;
	}

	if (!_courseCodeMatch.Match(*roster, flightIds)) {
		return false;
	}


	if (!_trainingRoleMatch.Match(*roster, flightIds)) {
		return false;
	}

	if (!_IPOrCKQualMatch.Match(*roster)) {
		return false;
	}

	if (!MatchFootprintTypeAndExtraCourse(*roster, segment, offsetTZMinutes)) {
		return false;
	}

	if (!MatchFootprintTypeAndFirstDutyDate(*roster, segment, allProgramList, offsetTZMinutes)) {
		return false;
	}

	if (!_chiefPilotRankMatch.Match(*roster)) {
		return false;
	}


	return true;
}
