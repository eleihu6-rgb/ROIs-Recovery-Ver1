/**
 * @file CheckAcclimatizedRestRuleForEva.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckAcclimatizedRestRuleForEva.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"
#include <algorithm>

bool CheckAcclimatizedRestRuleForEva::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	time_t checkedStartTime = 0, checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}
	vector<SharedPtr<DBRule_8014>>& asnGroup = this->_dbData->rule_8014;
	const auto& crew = this->_dbData->crewIdMap[rosters[0]->idcrew];

	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(crew->baseList, _dbData->scenario.startDtUTC);
	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.ClearParam();
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		_ruleViolation.SetRuleParam(ruleParam);
		_ruleViolation.SetParam("assignments", joinStrList(ruleParam._overrideExceptionAssignmentGroups, ","));
		_ruleViolation.SetParam("timezones", Utility::GetInstancePtr()->formatMinutes(ruleParam._minTimeZoneGap));
		_ruleViolation.SetParam("minrest", Utility::GetInstancePtr()->formatMinutes(ruleParam._minRestAtHomeBase));
		std::vector<std::string> assignmentException;
		for (const auto & group : ruleParam._overrideExceptionAssignmentGroups)
		{
			for (vector<SharedPtr<DBRule_8014>>::iterator assignment = asnGroup.begin(); assignment != asnGroup.end(); assignment++)
			{
				if ((*assignment)->assignmentGroup == group)
				{
					assignmentException.push_back((*assignment)->assignemnt);
				}
			}
		}
		for (size_t i = 0; i < rosters.size(); i++) {
			if (rosters[i]->pairing) {
				const auto& duties = rosters[i]->pairing->getDutyVec();
				const auto& size = duties.size();
				bool hasLayover = false;
				time_t endUtcAtBase = 0;
				int layover = 0;
				std::string dep = "";
				std::string arr = "";
				if (size > 1) {
					int continuousLayoverMinutes = 0;
					time_t lastTimezoneGapEndUtcAtBase = 0;
					std::string lastTimezoneGapStation = "";
					for (size_t z = 0; z < size - 1; z++) {
						Duty* duty = duties[z];
						Duty* nextDuty = duties[z + 1];
						const auto& lastSeg = duty->getLastSegment();
						time_t endTime = duty->getEndTimeUtcAct();
						// 改为降落时间 + 30分钟到下一段任务的brief
						if (lastSeg)
							endTime = lastSeg->getEndTimeUtcAct() + 30 * 60;
						const auto& layoverTime = nextDuty->getStartTimeUtcAct() - endTime;
						const auto& layoverStation = duties[z + 1]->getDepStation();
						auto timezoneGapMinutes = TimezoneUtils::abs(this->_dbData->getAirportOffsetMinutes(layoverStation) - this->_dbData->getAirportOffsetMinutes(base));
						if (timezoneGapMinutes >= ruleParam._minTimeZoneGap)
						{
							continuousLayoverMinutes += static_cast<int>(layoverTime / 60);
							lastTimezoneGapEndUtcAtBase = rosters[i]->actRestStrUtc;
							const auto& nextDutyLastSeg = nextDuty->getLastSegment();
							if (nextDutyLastSeg)
								lastTimezoneGapEndUtcAtBase = nextDutyLastSeg->getEndTimeUtcAct() + 30 * 60;
							lastTimezoneGapStation = layoverStation;
							if (continuousLayoverMinutes >= ruleParam._outstationAcclimatizedCondition)
							{
								endUtcAtBase = lastTimezoneGapEndUtcAtBase;
								dep = lastTimezoneGapStation;
								layover = continuousLayoverMinutes;
								hasLayover = true;
							}
						}
						else
						{
							continuousLayoverMinutes = 0;
							lastTimezoneGapEndUtcAtBase = 0;
							lastTimezoneGapStation = "";
						}
					}
					

					if (!hasLayover || endUtcAtBase == 0) {
						continue;
					}

					if (i != rosters.size() - 1)
					{

						for (size_t j = i + 1; j < rosters.size(); j++)
						{
							if (rosters[j]->actStrUtc > endUtcAtBase + ruleParam._minRestAtHomeBase * 60)
								break;
							time_t nextRosterStartUtc = rosters[j]->actStrUtc;
							time_t nextRosterEndUtc = rosters[j]->actEndUtc;
							bool isOverlap = Utility::GetInstancePtr()->isTimeOverlap(endUtcAtBase, endUtcAtBase + ruleParam._minRestAtHomeBase * 60, nextRosterStartUtc, nextRosterEndUtc);
							if (isOverlap)
							{
								layover = static_cast<int>(nextRosterStartUtc - endUtcAtBase) / 60;
								vector<string> roster_dutyTypes;
								string duty_code = rosters[j]->qualifier;
								if (!rosters[j]->pairing)  //GROUND ROSTER
								{
									vector<string>::iterator find_it = std::find(assignmentException.begin(), assignmentException.end(), duty_code);
									if (find_it == assignmentException.end())
									{
										if (this->_application == ROSTER_OPTIMIZER)
										{
											//	if (!hasOptimizedNewRosterInRange(rosters, endUtcAtBase, endUtcAtBase + range * 60))
											//		continue;
											//	if (!(rosters[i]->needRuleCheck) && !(rosters[j]->needRuleCheck))
											//		continue;
											if (rosters[i]->source == "PA" && rosters[j]->source == "PA")
												continue;
											return false;
										}
										_ruleViolation.SetParam("start", to_string(endUtcAtBase));
										_ruleViolation.SetParam("end", to_string(rosters[j]->actStrUtc));
										_ruleViolation.SetParam("actRest", Utility::GetInstancePtr()->getClock_format(layover / 60, layover % 60));
										_ruleViolation.SetParam("nextArr", rosters[j]->location);
										_ruleViolation.SetParam("offset1", Utility::GetInstancePtr()->getClock_format(this->_dbData->getAirportOffsetMinutes(dep) / 60, this->_dbData->getAirportOffsetMinutes(dep) % 60));
										_ruleViolation.SetParam("offset2", Utility::GetInstancePtr()->getClock_format(this->_dbData->getAirportOffsetMinutes(rosters[j]->location) / 60, this->_dbData->getAirportOffsetMinutes(rosters[j]->location) % 60));
										ThrowRuleViolation(rosters[i]);

									}
								}
								else //PAIRING
								{
									const auto & duty = rosters[j]->pairing->getFirstDuty();
									if (!duty)
										continue;

									if (RosterUtils::ExistExceptionCode(rosters[j], duty, ruleParam.GetExceptionCodes(), _dbData)) {
										continue;
									}

									if (std::find(assignmentException.begin(), assignmentException.end(), duty->getAssignment()) != assignmentException.end())
										continue;

									string nextArr = duty->getArrStation();

									int tmzoneExcept = TimezoneUtils::abs(this->_dbData->getAirportOffsetMinutes(nextArr) - this->_dbData->getAirportOffsetMinutes(dep));
									//exception: time zone differences between two rosters <=3 hours
									if (tmzoneExcept <= ruleParam._overrideExceptionTimeZoneGap)
										continue;

												
									//for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); ++segment)
									{
										time_t minRestEndAtBase = endUtcAtBase + ruleParam._minRestAtHomeBase * 60;
										bool isSegOverlap = Utility::GetInstancePtr()->isTimeOverlap(endUtcAtBase, minRestEndAtBase, duty->getStartTimeUtcAct(), duty->getEndTimeUtcAct());
										if (minRestEndAtBase == duty->getStartTimeUtcAct())
											isSegOverlap = false;
										if (isSegOverlap)
										{
												
											if (this->_application == ROSTER_OPTIMIZER)
											{
												/*if (!hasOptimizedNewRosterInRange(rosters, endUtcAtBase, endUtcAtBase + range * 60))
													continue;
												if (!(rosters[i]->needRuleCheck) && !(rosters[j]->needRuleCheck))
													continue;*/
												if (rosters[i]->source == "PA" && rosters[j]->source == "PA")
													continue;
												return false;
											}
											
											_ruleViolation.SetParam("end", to_string(duty->getStartTimeUtcAct()));
											
											_ruleViolation.SetParam("start", to_string(endUtcAtBase));
											_ruleViolation.SetParam("actRest", Utility::GetInstancePtr()->getClock_format(layover / 60, layover % 60));
											_ruleViolation.SetParam("nextArr", rosters[j]->location);
											_ruleViolation.SetParam("offset1", Utility::GetInstancePtr()->getClock_format(this->_dbData->getAirportOffsetMinutes(dep) / 60, this->_dbData->getAirportOffsetMinutes(dep) % 60));
											_ruleViolation.SetParam("offset2", Utility::GetInstancePtr()->getClock_format(this->_dbData->getAirportOffsetMinutes(rosters[j]->location) / 60, this->_dbData->getAirportOffsetMinutes(rosters[j]->location) % 60));
											ThrowRuleViolation(rosters[i]);

												
										}
									}
											
								}

							}
							
						}
					}
				}
			}
		}
	}
	return true;
}

void CheckAcclimatizedRestRuleForEva::ThrowRuleViolation(const ROSTER* roster) const {
	const auto& assignments = _ruleViolation.GetParam("assignments");
	const auto& minrest = _ruleViolation.GetParam("minrest");
	const auto& nextArr = _ruleViolation.GetParam("nextArr");
	const auto& actRest = _ruleViolation.GetParam("actRest");
	const auto& timezones = _ruleViolation.GetParam("timezones");
	const auto& offset1 = _ruleViolation.GetParam("offset1");
	const auto& offset2 = _ruleViolation.GetParam("offset2");
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	string msgViolation = "Since the crew member's next assigned duty after returning to base is not of the " + assignments + " duty type, the current rest period(" + actRest + ") at home base must be at least " + minrest + " hours.";
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = roster->idcrew;
	rv->rosterId = roster->rosterId;
	rv->pairingId = roster->pairId;
	//rv->dutySequenceNumber = (*duty_iter)->getDutySegNum();
	//rv->segmentId = (*seg_iter)->getDBId();
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
	//OP#1448提供message参数给gantt
	rv->operation_result.insert(pair<string, string>("dep", roster->label));
	rv->operation_result.insert(pair<string, string>("nextArr", nextArr));
	rv->operation_result.insert(pair<string, string>("offset1", offset1));
	rv->operation_result.insert(pair<string, string>("offset2", offset2));
	rv->operation_result.insert(pair<string, string>("timezones", timezones));
	rv->operation_result.insert(pair<string, string>("actualRest", actRest));
	rv->operation_result.insert(pair<string, string>("minrest_base", minrest));
	rv->violation_msg = msgViolation;
	_ruleViolation.AddRuleViolations(rv);
}


void CheckAcclimatizedRestRuleForEva::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckAcclimatizedRestRuleParamForEva(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

}
