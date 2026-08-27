/**
 * @file TaskOnlyBeOperatedByFilteredCrewForPRRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-10-15
**/

#include "../RuleSytem.h"
#include "TaskOnlyBeOperatedByFilteredCrewForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/PhaseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/CrewRpRecencyIndex.h"


bool TaskOnlyBeOperatedByFilteredCrewForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;
	if (rosters.empty()) {
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

	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string crewBase = crew->getPrimeBase();
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeLocSch(), crewBase, this->GetDataContext());

	for (auto& [phase, taskToCrewOfPhase] : _phaseToAllTaskToCrewMap) {
		auto& allTaskToRuleParamMap = taskToCrewOfPhase.allTaskToRuleParamMap;
		auto& allTaskRuleParamToCrewMap = taskToCrewOfPhase.allTaskRuleParamToCrewMap;
		auto& ruleParamMap = taskToCrewOfPhase.ruleParamMap;

		for (auto& roster : rosters) {
			if (roster->pairing == nullptr) {
				auto iterTaskToRuleParam = allTaskToRuleParamMap.find(roster->rosterId);
				if (iterTaskToRuleParam != allTaskToRuleParamMap.end()) {
					auto groundRosterRuleParamId = iterTaskToRuleParam->second; //Roster匹配到规则
					auto iterRuleParam = ruleParamMap.find(groundRosterRuleParamId);
					if (iterRuleParam == ruleParamMap.end()) {
						continue;
					}
					auto& ruleParam = *(iterRuleParam->second);
					_ruleViolation.SetRuleParam(ruleParam);
					auto iterTaskRuleParamToCrew = allTaskRuleParamToCrewMap.find(groundRosterRuleParamId);
					if (iterTaskRuleParamToCrew != allTaskRuleParamToCrewMap.end()) {
						const unordered_map<long long, set<string>>& ruleParamCrewMap = iterTaskRuleParamToCrew->second;
						if (ruleParamCrewMap.size() == 1) {
							auto crewRuleParamId = ruleParamCrewMap.begin()->first;
							if (crewRuleParamId == -1) {
								ThrowRuleViolationForGroundRoster(roster, crew, ruleParam);
								passAllRule = false;
								if (!IsCheckAllRule()) {
									return passAllRule;
								}
							}
						}
						else if (ruleParamCrewMap.size() >= 2) {
							for (auto& pair : ruleParamCrewMap) {
								auto crewRuleParamId = pair.first;
								auto& crewIds = pair.second;
								if (crewRuleParamId != groundRosterRuleParamId && crewIds.find(crew->idCrew) != pair.second.end()) {
									ThrowRuleViolationForGroundRoster(roster, crew, ruleParam);
									passAllRule = false;
									if (!IsCheckAllRule()) {
										return passAllRule;
									}
								}

							}

						}
					}
					
				}
			}
			else {
				for (auto& duty : roster->pairing->getDutyVec()) {
					for (auto& segment : duty->getSegmentsRead()) {
						auto iterTaskToRuleParam = allTaskToRuleParamMap.find(segment->getSegmentId());
						if (iterTaskToRuleParam != allTaskToRuleParamMap.end()) {
							auto segmentRuleParamId = iterTaskToRuleParam->second; //Roster匹配到规则
							auto iterRuleParam = ruleParamMap.find(segmentRuleParamId);
							if (iterRuleParam == ruleParamMap.end()) {
								continue;
							}
							TaskOnlyBeOperatedByFilteredCrewForPRRuleParam& ruleParam = *iterRuleParam->second;
							_ruleViolation.SetRuleParam(ruleParam);
							auto iterTaskRuleParamToCrew = allTaskRuleParamToCrewMap.find(segmentRuleParamId);
							if (iterTaskRuleParamToCrew != allTaskRuleParamToCrewMap.end()) {
								const unordered_map<long long, set<string>>& ruleParamCrewMap = iterTaskRuleParamToCrew->second;
								if (ruleParamCrewMap.size() == 1) {
									auto crewRuleParamId = ruleParamCrewMap.begin()->first;
									if (crewRuleParamId == -1) {
										ThrowRuleViolationForFlight(roster, crew, segment, ruleParam);
										passAllRule = false;
										if (!IsCheckAllRule()) {
											return passAllRule;
										}
									}
								}
								else if (ruleParamCrewMap.size() >= 2) {
									for (auto& pair : ruleParamCrewMap) {
										auto crewRuleParamId = pair.first;
										auto& crewIds = pair.second;
										if (crewRuleParamId != segmentRuleParamId && crewIds.find(crew->idCrew) != crewIds.end()) {
											ThrowRuleViolationForFlight(roster, crew, segment, ruleParam);
											passAllRule = false;
											if (!IsCheckAllRule()) {
												return passAllRule;
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
	}
	return passAllRule;
}

inline static void updateAllTaskAndCrewRuleParamMap(unordered_map<long long, unordered_map<long long, set<string>>>& allTaskRuleParamToCrewMap, const long long crewRuleParamId, const std::shared_ptr<CREW>& crew, const TaskOnlyBeOperatedByFilteredCrewForPRRuleParam& ruleParam) {
	auto iterTaskRuleParam = allTaskRuleParamToCrewMap.find(ruleParam.GetRuleParamId());
	if (iterTaskRuleParam == allTaskRuleParamToCrewMap.end()) {
		//map<CrewRuleParamId, vector<Crew>>> CrewRuleParamId可能为 - 1（ - 1表示该Crew没有在规则中配置）
		unordered_map<long long, set<string>> ruleParamCrewMap;
		ruleParamCrewMap.insert(std::make_pair(crewRuleParamId, std::set<string>({ crew->idCrew })));
		allTaskRuleParamToCrewMap.insert(std::make_pair(ruleParam.GetRuleParamId(), ruleParamCrewMap));
	}
	else {
		auto& ruleParamCrewMap = iterTaskRuleParam->second;
		auto iterRuleParamCrew = ruleParamCrewMap.find(crewRuleParamId);
		if (iterRuleParamCrew == ruleParamCrewMap.end()) {
			ruleParamCrewMap.insert(std::make_pair(crewRuleParamId, std::set<string>({ crew->idCrew })));
		}
		else {
			iterRuleParamCrew->second.emplace(crew->idCrew);
		}
	}
}

inline static void updateAllTaskToRuleParamMap(unordered_map<long long, long long>& allTaskToRuleParamMap, const ROSTER* roster, const Segment* segment, const TaskOnlyBeOperatedByFilteredCrewForPRRuleParam& ruleParam) {
	if (segment == nullptr) {
		allTaskToRuleParamMap.insert(std::make_pair(roster->rosterId, ruleParam.GetRuleParamId()));
	}
	else {
		allTaskToRuleParamMap.insert(std::make_pair(segment->getSegmentId(), ruleParam.GetRuleParamId())); //这里使用SegmentId保证其唯一性
	}
	
}

void TaskOnlyBeOperatedByFilteredCrewForPRRule::InitTaskAndCrewRuleParamMap(const vector<std::shared_ptr<CREW>>& crewList) {
	for (auto& crew : crewList) {
		UpdateTaskAndCrewRuleParamMap(crew);
	}
}

void TaskOnlyBeOperatedByFilteredCrewForPRRule::RemoveTaskAndCrewRuleParamMap(const std::shared_ptr<CREW>& crew, const std::shared_ptr<ROSTER>& roster, const Pairing* oldPairing) {
	for (auto& [phase, taskToCrewOfPhase] : _phaseToAllTaskToCrewMap) {
		auto& allTaskToRuleParamMap = taskToCrewOfPhase.allTaskToRuleParamMap;
		auto& allTaskRuleParamToCrewMap = taskToCrewOfPhase.allTaskRuleParamToCrewMap;

		if (roster->pairing == nullptr) {
			auto iterTaskToRuleParam = allTaskToRuleParamMap.find(roster->rosterId);
			if (iterTaskToRuleParam != allTaskToRuleParamMap.end()) {
				auto groundRosterRuleParamId = iterTaskToRuleParam->second;
				auto iterTaskRuleParamToCrew = allTaskRuleParamToCrewMap.find(groundRosterRuleParamId);
				if (iterTaskRuleParamToCrew != allTaskRuleParamToCrewMap.end()) {
					auto& ruleParamCrewMap = iterTaskRuleParamToCrew->second;
					for (auto& pair : ruleParamCrewMap) {
						auto crewRuleParamId = pair.first;
						auto& crewIds = pair.second;
						crewIds.erase(crew->idCrew);
						if (crewIds.empty()) {
							ruleParamCrewMap.erase(crewRuleParamId);
							break;
						}
					}

					if (ruleParamCrewMap.empty()) {
						allTaskRuleParamToCrewMap.erase(groundRosterRuleParamId);
					}

				}
			}
		}
		else {
			//oldPairing==nullptr表示取消pairing分配操作（del roster)，否则update pairing操作(update pairing)
			auto& duties = oldPairing == nullptr ? roster->pairing->getDutyVec() : oldPairing->getDutyVec();
			for (auto& duty : duties) {
				for (auto& segment : duty->getSegmentsRead()) {
					auto iterTaskToRuleParam = allTaskToRuleParamMap.find(segment->getSegmentId());
					if (iterTaskToRuleParam != allTaskToRuleParamMap.end()) {
						auto segmentRuleParamId = iterTaskToRuleParam->second;
						auto iterTaskRuleParamToCrew = allTaskRuleParamToCrewMap.find(segmentRuleParamId);
						if (iterTaskRuleParamToCrew != allTaskRuleParamToCrewMap.end()) {
							auto& ruleParamCrewMap = iterTaskRuleParamToCrew->second;
							for (auto& pair : ruleParamCrewMap) {
								auto crewRuleParamId = pair.first;
								auto& crewIds = pair.second;
								crewIds.erase(crew->idCrew);
								if (crewIds.empty()) {
									ruleParamCrewMap.erase(crewRuleParamId);
									break;
								}
							}

							if (ruleParamCrewMap.empty()) {
								allTaskRuleParamToCrewMap.erase(segmentRuleParamId);
							}
						}
					}
				}
			}
		}
	}
}

void TaskOnlyBeOperatedByFilteredCrewForPRRule::UpdateTaskAndCrewRuleParamMap(const std::shared_ptr<CREW>& crew) {
	unordered_map<string, set<long long>> crewRuleParamMap; //map<CrewId,ruleParamId>, 如果没有匹配到规则，则ruleParamId=-1
	for (auto& roster : crew->rosterList) {
		UpdateTaskAndCrewRuleParamMap(crew, roster);
	}
}

void TaskOnlyBeOperatedByFilteredCrewForPRRule::UpdateTaskRosterId(const long long oldId, const long long newId) {
	for (auto& [phase, taskToCrewOfPhase] : _phaseToAllTaskToCrewMap) {
		auto& allTaskToRuleParamMap = taskToCrewOfPhase.allTaskToRuleParamMap;
		auto it = allTaskToRuleParamMap.find(oldId);
		if (it != allTaskToRuleParamMap.end()) {
			auto ruleParamId = it->second;
			allTaskToRuleParamMap.erase(it);
			allTaskToRuleParamMap.insert(std::make_pair(newId, ruleParamId));
		}
	}
}

void TaskOnlyBeOperatedByFilteredCrewForPRRule::UpdateTaskAndCrewRuleParamMap(const std::shared_ptr<CREW>& crew, const std::shared_ptr<ROSTER>& roster) {
	if (roster->pairing == nullptr) {
		for (auto& ruleParam : this->_ruleParams) {
			long long crewRuleParamId = -1;
			if (ruleParam.MatchCrew(roster.get(), crew)) {
				crewRuleParamId = ruleParam.GetRuleParamId();
			}

			auto& taskToCrewOfPhase = _phaseToAllTaskToCrewMap[ruleParam.GetPhase()];
			auto& ruleParamMap = taskToCrewOfPhase.ruleParamMap;
			auto& allTaskRuleParamToCrewMap = taskToCrewOfPhase.allTaskRuleParamToCrewMap;
			auto& allTaskToRuleParamMap = taskToCrewOfPhase.allTaskToRuleParamMap;
			if (ruleParam.MatchGroundRoster(roster.get())) {
				ruleParamMap.insert(std::make_pair(ruleParam.GetRuleParamId(), (TaskOnlyBeOperatedByFilteredCrewForPRRuleParam*)(&ruleParam)));
				updateAllTaskAndCrewRuleParamMap(allTaskRuleParamToCrewMap, crewRuleParamId, crew, ruleParam);
				updateAllTaskToRuleParamMap(allTaskToRuleParamMap, roster.get(), nullptr, ruleParam);
			}
		}
	}
	else {
		for (auto& ruleParam : this->_ruleParams) {
			long long crewRuleParamId = -1;
			if (ruleParam.MatchCrew(roster.get(), crew)) {
				crewRuleParamId = ruleParam.GetRuleParamId();
			}

			auto& taskToCrewOfPhase = _phaseToAllTaskToCrewMap[ruleParam.GetPhase()];
			auto& ruleParamMap = taskToCrewOfPhase.ruleParamMap;
			auto& allTaskRuleParamToCrewMap = taskToCrewOfPhase.allTaskRuleParamToCrewMap;
			auto& allTaskToRuleParamMap = taskToCrewOfPhase.allTaskToRuleParamMap;
			for (auto& duty : roster->pairing->getDutyVec()) {
				for (auto& segment : duty->getSegmentsRead()) {
					if (ruleParam.MatchFlight(roster.get(), segment)) {
						ruleParamMap.insert(std::make_pair(ruleParam.GetRuleParamId(), (TaskOnlyBeOperatedByFilteredCrewForPRRuleParam*)(&ruleParam)));
						updateAllTaskAndCrewRuleParamMap(allTaskRuleParamToCrewMap, crewRuleParamId, crew, ruleParam);
						updateAllTaskToRuleParamMap(allTaskToRuleParamMap, roster.get(), segment, ruleParam);
					}
				}
			}
		}
	}
}

void TaskOnlyBeOperatedByFilteredCrewForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(TaskOnlyBeOperatedByFilteredCrewForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(TaskOnlyBeOperatedByFilteredCrewForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void TaskOnlyBeOperatedByFilteredCrewForPRRule::ThrowRuleViolationForFlight(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const Segment* segment, const TaskOnlyBeOperatedByFilteredCrewForPRRuleParam& ruleParam) const {
	//航班任务不能被Crew执行
	string msg = "Flight (Para: {0:taskFilterConditon}) can only be operated by the filtered crew (Para: {1:crewFilterConditon})";
	msg = StringUtils::Format(msg, ruleParam.GetTaskFilterConditionDesc(), ruleParam.GetCrewFilterConditionDesc());

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = roster->rosterId;
	rv->pairingId = roster->pairing == nullptr ? -1 : roster->pairId;
	rv->dutySequenceNumber = segment->getDutySeq();
	rv->segmentId = segment->getDBId();
	rv->startDTUtc = segment->getStartTimeUtcAct();
	rv->endDTUtc = segment->getEndTimeUtcAct();
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("airline", segment->getAirline()));
	rv->operation_result.insert(pair<string, string>("flightNum", segment->getFlightNumber()));

	_ruleViolation.AddRuleViolations(rv);
}

void TaskOnlyBeOperatedByFilteredCrewForPRRule::ThrowRuleViolationForGroundRoster(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const TaskOnlyBeOperatedByFilteredCrewForPRRuleParam& ruleParam) const {
	//地面任务不能被执行Crew
	//航班任务不能被Crew执行
	string msg = "Ground duty (Para: {0:taskFilterConditon}) can only be operated by the filtered crew (Para: {1:crewFilterConditon})";
	msg = StringUtils::Format(msg, ruleParam.GetTaskFilterConditionDesc(), ruleParam.GetCrewFilterConditionDesc());

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = roster->rosterId;
	rv->startDTUtc = roster->getStartTimeUtcAct();
	rv->endDTUtc = roster->getRestStartUtcAct();
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("assignment", roster->qualifier));
	_ruleViolation.AddRuleViolations(rv);
}