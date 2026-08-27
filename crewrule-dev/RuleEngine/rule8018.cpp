#pragma once

#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "CustomBiz/CustomBiz.h"
#include "TimezoneUtils.h"
#include "../utils/PhaseUtils.h"

//8018
//码逻辑梳理：
//1 遍历前置任务, 每个前置任务各自遍历后续后置任务
//2 判断是否必要检查
//	只有前置 it_roster为飞行时才检查
//	只有前置 包含多duty、即包含layover，且末尾layover >= OutstationAcclimatizedCondition 才检查,
//	只有前置 末尾duty，出发机场与到达机场时区间距 >= MinTimeZoneGap 才检查，小于时跳过后续检查逻辑
//3 查找可能违规后置任务
//	休息区间 = [前置end, 前置end + MinRestAtHome]，
//	其中前置.end = 前置duty.end + duty.actDropoff
//	休息区间例外：若后置任务为半环，则休息开始按后置 roster.restStart。（是否应为前置roster.restStart？)
//	后置任务 = [后置任务.start, 后置任务.end]
//	判断是否重叠： 休息区间, 后置任务
//	判断后置任务是否属于例外类型，OVERRIDE EXCEPTION ASSIGNMENT GROUP
//	若重叠且不属于例外类型，则告警
bool LegalityChecker::checkAcclimatizedRest(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	DBG_HELP("LegalityChecker::checkAcclimatizedRest");

	bool isValid = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string outstation, timezones, minrest_base, override_duties, timezonesException = "03:00";

	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = trim(iter->first);
		headeValue = trim(iter->second);
		//transform(header.begin(), header.end(), header.begin(), ::toupper);
		//transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		//OUTSTATION ACCLIMATIZED CONDITION,MIN TIME ZONE GAP,MIN REST AT HOME BASE,OVERRIDE EXCEPTION DUTY
		//GRD.GRD
		if (header == "OUTSTATION ACCLIMATIZED CONDITION")
			outstation = headeValue;
		if (header == "MIN TIME ZONE GAP")
			timezones = headeValue;
		if (header == "MIN REST AT HOME BASE")
			minrest_base = headeValue;
		if (header == "OVERRIDE EXCEPTION ASSIGNMENT GROUP")
			override_duties = headeValue;
		if (header == "OVERRIDE EXCEPTION TIME ZONE GAP")
			timezonesException = headeValue;
	}

	vector<SharedPtr<ROSTER>>& rosters = _dbData->crewList[pCrew->crewIndex]->rosterList;
	vector<SharedPtr<DBRule_8014>>& asnGroup = this->_dbData->rule_8014;
	vector<string> vDutyGroupException, vDutyException;
	split(override_duties, '|', vDutyGroupException);
	//boost::split(vDutyGroupException, override_duties, boost::is_any_of("|"), boost::token_compress_on);
	for (vector<string>::iterator group_it = vDutyGroupException.begin(); group_it != vDutyGroupException.end(); group_it++)
	{
		for (vector<SharedPtr<DBRule_8014>>::iterator assignment = asnGroup.begin(); assignment != asnGroup.end(); assignment++)
		{
			if ((*assignment)->assignmentGroup == (*group_it))
			{
				vDutyException.push_back((*assignment)->assignemnt);
			}
		}
	}
	//int layoverOutstationReq = boost::lexical_cast<int>(outstation.substr(0, 2)) * 60 + boost::lexical_cast<int>(outstation.substr(3, 2));
	//int timezone_gap_req = boost::lexical_cast<int>(timezones.substr(0, 2)) * 60 + boost::lexical_cast<int>(timezones.substr(3, 2));
	//int timezone_gap_except = boost::lexical_cast<int>(timezonesException.substr(0, 2)) * 60 + boost::lexical_cast<int>(timezonesException.substr(3, 2));
	//int range = boost::lexical_cast<int>(minrest_base.substr(0, 2)) * 60 + boost::lexical_cast<int>(minrest_base.substr(3, 2));
	int layoverOutstationReq = Utility::GetInstancePtr()->convertToMinutes(outstation);
	int timezone_gap_req = Utility::GetInstancePtr()->convertToMinutes(timezones);
	int timezone_gap_except = Utility::GetInstancePtr()->convertToMinutes(timezonesException);
	int range = Utility::GetInstancePtr()->convertToMinutes(minrest_base);

	SharedPtr<CREW> crew = _dbData->crewList[pCrew->crewIndex];
	
	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(crew->baseList, _dbData->scenario.startDtUTC);
	for (vector<SharedPtr<ROSTER>>::iterator it_roster = rosters.begin(); it_roster != rosters.end(); it_roster++)
	{
		//if ((*it_roster)->pairing && ((((*it_roster)->needRuleCheck) && (this->_application == ROSTER_OPTIMIZER)) || (this->_application != ROSTER_OPTIMIZER)))
		//if (crew->idCrew == "0000095110") {
		//	cout << "";
		//}
		if ((*it_roster)->pairing)
		{
			if ((*it_roster) != nullptr && !PhaseUtils::IsChecked((*it_roster).get(), singleRule->phase, this->_dbData)) {
				continue;
			}

			//(*it_roster)->pairing->calcuate(maps);
			//20181016 ain, 重构 fdp/dp/bh计算
			//calculatePairingDutyTimes((*it_roster)->pairing, _dbData.get());
			vector<Duty *> duties = (*it_roster)->pairing->getDutyVec();
			int size = (int)duties.size();
			if (size >= 2)
			{
				Duty * duty = duties[size - 2];
				Duty * nextDuty = duties[size - 1];

				int layover = duty->getActualRest();

				if (layover >= layoverOutstationReq)
				{
					std::string dep = duties[size - 1]->getDepStation();
					std::string arr = duties[size - 1]->getArrStation();
					auto timezoneGapMinutes = TimezoneUtils::abs(this->_dbData->getAirportOffsetMinutes(arr) - this->_dbData->getAirportOffsetMinutes(dep));
					if (timezoneGapMinutes >= timezone_gap_req)
					{
						//check minrest_base and duties exception
						time_t endUtcAtBase = duties[size - 1]->getEndTimeUtcAct() + duties[size - 1]->getActualDropoffMin() * 60;
						vector<SharedPtr<ROSTER>>::iterator it_roster1 = it_roster;

						if (it_roster1 != rosters.end())
						{
							it_roster1++;
							
							for (; it_roster1 != rosters.end(); it_roster1++)
							{
								if ((*it_roster1)->actStrUtc > endUtcAtBase + range * 60)
									break;
								if (Utility::GetInstancePtr()->isHalfRoster((*it_roster1)) && (*it_roster1)->location != base)
								{
									endUtcAtBase = (*it_roster1)->restStrUtc;
									continue;
								}
								//mantis#7591 新增8018 到基地后再检查rest是否足够
								//mantis#9165: 8018法规对SHA和PVG两个同城机场没有生效,新增同城判断
								if ((*it_roster1)->location != base && strcmp(this->_dbData->airportCodeMap[(*it_roster1)->location]->city,this->_dbData->airportCodeMap[base]->city)){
									if ((*it_roster1)->pairing){
										vector<Duty *> ds = (*it_roster1)->pairing->getDutyVec();
										if (ds.size()){
											time_t endUtcAtBase = ds[ds.size() - 1]->getEndTimeUtcAct() + ds[ds.size() - 1]->getActualDropoffMin() * 60;
										}
										continue;
									}
									endUtcAtBase = (*it_roster1)->restStrUtc;
									continue;
								}
								time_t nextRosterStartUtc = (*it_roster1)->actStrUtc;
								time_t nextRosterEndUtc = (*it_roster1)->actEndUtc;
								bool isOverlap = Utility::GetInstancePtr()->isTimeOverlap(endUtcAtBase, endUtcAtBase + range * 60, nextRosterStartUtc, nextRosterEndUtc);
								if (isOverlap)
								{
									layover = static_cast<int>(nextRosterStartUtc - endUtcAtBase) / 60;
									vector<string> roster_dutyTypes;
									string duty_code = (*it_roster1)->qualifier;
									if (!(*it_roster1)->pairing)  //GROUND ROSTER
									{
										vector<string>::iterator find_it = std::find(vDutyException.begin(), vDutyException.end(), duty_code);
										if (find_it == vDutyException.end())
										{
											if (this->_application == ROSTER_OPTIMIZER)
											{
											//	if (!hasOptimizedNewRosterInRange(rosters, endUtcAtBase, endUtcAtBase + range * 60))
											//		continue;
											//	if (!((*it_roster)->needRuleCheck) && !((*it_roster1)->needRuleCheck))
											//		continue;
												if ((*it_roster)->source == "PA" && (*it_roster1)->source == "PA")
													continue;
											}
											pCrew->isLegal = false;
											if (this->GetApplication() == ROSTER_OPTIMIZER) {
												return false;
											}
											isValid = false;
											string msgViolation = "Since the crew member's next assigned duty after returning to base is not of the " + override_duties + " duty type, the current rest period at home base must be at least " + minrest_base + " hours.";
											this->setLegalityMessage((*it_roster), pCrew, singleRule, msgViolation);
											RULE_VIOLATION* rv = new RULE_VIOLATION();
											rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
											rv->rosterId = (*it_roster)->rosterId;
											rv->pairingId = (*it_roster)->pairId;
											//rv->dutySequenceNumber = (*duty_iter)->getDutySegNum();
											//rv->segmentId = (*seg_iter)->getDBId();
											rv->startDTUtc = (*it_roster)->actStrUtc;
											rv->endDTUtc = (*it_roster)->actEndUtc;
											rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
											//OP#1448提供message参数给gantt
											rv->operation_result.insert(pair<string, string>("dep", (*it_roster)->label));
											rv->operation_result.insert(pair<string, string>("nextArr", (*it_roster1)->label));
											rv->operation_result.insert(pair<string, string>("offset1", Utility::GetInstancePtr()->getClock_format(this->_dbData->getAirportOffsetMinutes(dep) / 60, this->_dbData->getAirportOffsetMinutes(dep) % 60)));
											rv->operation_result.insert(pair<string, string>("offset2", Utility::GetInstancePtr()->getClock_format(this->_dbData->getAirportOffsetMinutes((*it_roster1)->location) / 60, this->_dbData->getAirportOffsetMinutes((*it_roster1)->location) % 60)));
											rv->operation_result.insert(pair<string, string>("timezones", timezones));
											rv->operation_result.insert(pair<string, string>("actualRest", Utility::GetInstancePtr()->getClock_format(layover / 60, layover % 60)));
											rv->operation_result.insert(pair<string, string>("minrest_base", minrest_base));
											rv->violation_msg = msgViolation;
											this->addRuleViolations(rv, singleRule);
										}
									}
									else //PAIRING
									{
										if (std::find(vDutyException.begin(), vDutyException.end(), (*it_roster1)->qualifier) != vDutyException.end())
											continue;

										vector<Duty *> duties = (*it_roster1)->pairing->getDutyVec();
										if (duties.size() == 0)
											continue;

										string nextArr = duties[0]->getArrStation();

										int tmzoneExcept = TimezoneUtils::abs(this->_dbData->getAirportOffsetMinutes(nextArr) - this->_dbData->getAirportOffsetMinutes(dep));
										//exception: time zone differences between two rosters <=3 hours
										if (tmzoneExcept < timezone_gap_except)
											continue;

										for (vector<Duty*>::iterator duty = duties.begin(); duty != duties.end(); ++duty)
										{
											vector<Segment*> segments = (*duty)->getSegments();

											if (segments.size() == 0)
												continue;
											//for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); ++segment)
											{
												bool isSegOverlap = Utility::GetInstancePtr()->isTimeOverlap(endUtcAtBase, endUtcAtBase + range * 60, (*duty)->getStartTimeUtcAct(), (*duty)->getEndTimeUtcAct());
												Segment* segment = segments[0];

												if (isSegOverlap)
												{
													string assignment = segment->getAssignment();
													if (assignment.size() == 0)
														assignment = "FLY";
													string arr = segment->getArrStation();
													vector<string>::iterator find_it = std::find(vDutyException.begin(), vDutyException.end(), assignment);
													//if ((find_it == vDutyException.end() && base == (*it_roster)->getBase())
													//|| (base != (*it_roster)->getBase() && std::find(vDutyException.begin(), vDutyException.end(), duty_code) == vDutyException.end()))
													if ((base == arr && find_it == vDutyException.end())
														|| (base != arr && std::find(vDutyException.begin(), vDutyException.end(), duty_code) == vDutyException.end()))
													{
														if (this->_application == ROSTER_OPTIMIZER)
														{
															/*if (!hasOptimizedNewRosterInRange(rosters, endUtcAtBase, endUtcAtBase + range * 60))
																continue;
															if (!((*it_roster)->needRuleCheck) && !((*it_roster1)->needRuleCheck))
																continue;*/
															if ((*it_roster)->source == "PA" && (*it_roster1)->source == "PA")
																continue;
														}
														pCrew->isLegal = false;
														if (this->GetApplication() == ROSTER_OPTIMIZER) {
															return false;
														}
														isValid = false;
														string msgViolation = "Since the crew member's next assigned duty after returning to base is not of the " + override_duties + " duty type, the current rest period at home base must be at least " + minrest_base + " hours.";
														this->setLegalityMessage(segment, singleRule, msgViolation);
														RULE_VIOLATION* rv = new RULE_VIOLATION();
														rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
														rv->rosterId = (*it_roster)->rosterId;
														rv->pairingId = (*it_roster)->pairId;
														rv->dutySequenceNumber = duties[0]->getDutySegNum();
														rv->segmentId = segment->getDBId();
														rv->startDTUtc = segment->getStartTimeUtcAct();
														rv->endDTUtc = segment->getEndTimeUtcAct();
														rv->violation_msg = msgViolation;
														rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
														//OP#1448提供message参数给gantt
														int restMinutes = static_cast<int>((*duty)->getStartTimeUtcAct() - endUtcAtBase) / 60;
														rv->operation_result.insert(pair<string, string>("dep", (*it_roster)->label));
														rv->operation_result.insert(pair<string, string>("nextArr", (*it_roster1)->label));
														rv->operation_result.insert(pair<string, string>("offset1", Utility::GetInstancePtr()->getClock_format(this->_dbData->getAirportOffsetMinutes(dep) / 60, this->_dbData->getAirportOffsetMinutes(dep) % 60)));
														rv->operation_result.insert(pair<string, string>("offset2", Utility::GetInstancePtr()->getClock_format(this->_dbData->getAirportOffsetMinutes(nextArr) / 60, this->_dbData->getAirportOffsetMinutes(nextArr) % 60)));
														rv->operation_result.insert(pair<string, string>("timezones", timezones));
														rv->operation_result.insert(pair<string, string>("actualRest", Utility::GetInstancePtr()->getClock_format(restMinutes / 60, restMinutes % 60)));
														rv->operation_result.insert(pair<string, string>("minrest_base", minrest_base));
														this->addRuleViolations(rv, singleRule);
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
		}
	}

	return isValid;
}