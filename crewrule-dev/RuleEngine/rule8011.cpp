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
#include "rule/framework/utils/RosterUtils.h"

bool LegalityChecker::checkPortReqByPairing(SharedPtr<CREW> crew, Pairing* pairing, string actingRank)
{
	bool bReturn = true;

	vector<SharedPtr<ROSTER>>& rosterlist = crew->rosterList;
	vector<SharedPtr<CREW_QUALIFICATION>>&  qual = crew->qualificationList;

	map<string, vector<DBPortQualReqmnts>>& portReq1 = this->_dbData->portQualReqmntsAirportMap;

	map<string, vector<DBPortQualReqmnts>>::iterator portmap_iter1, portmap_iter2, portmap_iter3;

	string fleet, rosterid, seg_stacode, seg_arrcode;
	string fltNum, airline_port, division_port, crew_group, fltnum_port, seg_fleetCD, seg_type;
	string airport, fleet_port, rank_port, qual_port, start_port, end_port, inout, seg_type_port;
	string base = pairing->getBase();
	auto iOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	vector<string> rank_port_list;
	vector<string> seg_type_list;
	vector<string> qual_port_list;
	//bool isFd = Utility::GetInstancePtr()->isFD(this->_dbData->rankList, actingRank);
	bool isFd = (crew->division == "P");
	auto qualExtensionConfigsForQualMap = RosterUtils::GetQualExtensionConfigs(crew, this->_dbData->qualExtensionConfigMap);
	vector<Duty *> dutylist = pairing->getDutyVec();
	for (vector<Duty *>::iterator duty_iter = dutylist.begin(); duty_iter != dutylist.end(); duty_iter++)
	{
		Duty::DUTY_TYPE dt = (*duty_iter)->getType();
		//if (dt != Duty::DUTY_FLY && dt != Duty::DUTY_PURE_OPR)
		//	continue;
		vector<Segment*> fltlist = (*duty_iter)->getSegments();
		for (vector<Segment*>::iterator seg_iter = fltlist.begin(); seg_iter != fltlist.end(); seg_iter++)
		{
			if (!(*seg_iter)->getIsOperating())
				continue;
			time_t seg_start_utc = (*seg_iter)->getStartTimeUtcAct();
			time_t seg_end_utc = (*seg_iter)->getEndTimeUtcAct();

			seg_fleetCD = (*seg_iter)->getFleetCD();

			seg_stacode = (*seg_iter)->getDepStation();
			seg_arrcode = (*seg_iter)->getArrStation();
			fltNum = (*seg_iter)->getSegNumber();
			seg_type = (*seg_iter)->getFltType();

			portmap_iter1 = portReq1.find(seg_stacode);
			portmap_iter2 = portReq1.find(seg_arrcode);
			portmap_iter3 = portReq1.find("*");
			vector<DBPortQualReqmnts> dbport1;

			if (portmap_iter1 != portReq1.end())
				dbport1 = (*portmap_iter1).second;

			if (portmap_iter2 != portReq1.end())
				dbport1.insert(dbport1.end(), (*portmap_iter2).second.begin(), (*portmap_iter2).second.end());

			if (portmap_iter3 != portReq1.end())
				dbport1.insert(dbport1.end(), (*portmap_iter3).second.begin(), (*portmap_iter3).second.end());

			SharedPtr<RosterFlight> rf = this->_dbData->rosterFlightMgr.get((*seg_iter)->getDBId(), crew->idCrew);
			for (vector<DBPortQualReqmnts>::iterator iter_port = dbport1.begin(); iter_port != dbport1.end(); iter_port++)
			{
				//op#2169 如果 tsFlag与exceptionCode有重复 不检查
				if (rf != NULL){
					vector <string> v1, v2, v3;
					split(rf->tsFlag, '|', v1);
					split((*iter_port).exceptionCode, '|', v2);
					v3.insert(v3.end(), v1.begin(), v1.end());
					v3.insert(v3.end(), v2.begin(), v2.end());
					int n = static_cast<int>(unique(v3.begin(), v3.end()) - v3.begin());
					if (n != v3.size() && v1[0] != "" && v2[0] != ""){
						continue;
					}
				}
				airline_port = (*iter_port).airline;
				division_port = (*iter_port).division;
				crew_group = (*iter_port).crewGroup;

				fltnum_port = (*iter_port).fltNum;
				airport = (*iter_port).airport;
				fleet_port = (*iter_port).fleet;
				rank_port = (*iter_port).rank;
				split(rank_port, '|', rank_port_list);
				seg_type_port = (*iter_port).segType;
				split(seg_type_port, '|', seg_type_list);
				qual_port = (*iter_port).qual;
				split(qual_port, '|', qual_port_list);
				time_t eff = (*iter_port).effLocal;
				time_t expiry = (*iter_port).expLocal;

				if (expiry < 0){
					expiry = time(NULL) + 2 * 365 * 24 * 60 * 60;
				}

				start_port = (*iter_port).startTime;
				end_port = (*iter_port).endTime;
				inout = (*iter_port).inOutInd;

				if (start_port.length() == 0)
					start_port = "00:00";
				else if (start_port.find(":") == string::npos)
					start_port = start_port.substr(0, 2) + ":" + start_port.substr(3, 2);

				if (end_port.length() == 0)
					end_port = "23:59";
				else if (start_port.find(":") == string::npos)
					end_port = end_port.substr(0, 2) + ":" + end_port.substr(3, 2);

				bool bStartInRange = Utility::GetInstancePtr()->IsTimesInRange(seg_start_utc, iOffsetMinutes, start_port, end_port);
				bool bEndInRange = Utility::GetInstancePtr()->IsTimesInRange(seg_end_utc, iOffsetMinutes, start_port, end_port);

				bool bFoundQual = true;
				if ((isFd && division_port == "P") || ((!isFd) && division_port == "C"))
				{
					if (fltnum_port.length() == 0 || fltnum_port == "*" || fltNum == fltnum_port)
					{
						if (fleet_port.length() == 0 || fleet_port == "*" || fleet_port == seg_fleetCD)
						{
							if (rank_port.length() == 0 || rank_port == "*" || std::find(rank_port_list.begin(), rank_port_list.end(), actingRank) != rank_port_list.end())
							{
								if ((eff < seg_start_utc + iOffsetMinutes * 60) && (expiry > seg_end_utc + iOffsetMinutes * 60)){

									if (((inout == "B") && (seg_stacode == airport || seg_arrcode == airport)) ||
										((inout == "O") && (seg_stacode == airport)) ||
										((inout == "I") && (seg_arrcode == airport)) || airport == "*")
									{
										//crew group not implemented
										if (((inout == "B") && (bStartInRange || bEndInRange)) ||
											((inout == "O") && (bStartInRange)) ||
											((inout == "I") && (bEndInRange)))
										{
											if (seg_type_list.size() == 0 || seg_type_list[0] == "" 
												|| find(seg_type_list.begin(), seg_type_list.end(), seg_type) != seg_type_list.end()) {
												bFoundQual = false;
												for (vector<SharedPtr<CREW_QUALIFICATION>>::iterator iter_qual = qual.begin(); iter_qual != qual.end(); iter_qual++)
												{
													// 去除isValid判断
													if (find(qual_port_list.begin(), qual_port_list.end(), (*iter_qual)->qual) != qual_port_list.end()) //mantis#8544, crewQual.isValid按1有效
													{
														time_t qual_eff = (*iter_qual)->issuedUtc;
														time_t qual_expiry = (*iter_qual)->expiryUtc;
														if (qual_expiry < 0) qual_expiry = time(NULL) + 2 * 365 * 24 * 60 * 60;
														if (this->_application == ROSTER_OPTIMIZER || (this->_application == ROSTER_EDITOR && this->_dbData->scenario.scenarioId > 0)) {
															auto qualPeriod = RosterUtils::GetQualExtension((*iter_qual), qualExtensionConfigsForQualMap);
															qual_eff = std::get<0>(qualPeriod);
															qual_expiry = std::get<1>(qualPeriod);
														}
														if ((qual_eff < seg_start_utc) && (qual_expiry > seg_end_utc))
														{
															bFoundQual = true;
														}
													}
												}
											}
											
											if ((!bFoundQual && !(*iter_port).isRestricted) || (bFoundQual && (*iter_port).isRestricted))
											{
												return false;
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
	return bReturn;
}

bool LegalityChecker::checkPortRequirements(RULE_LEGALITY * pCrew, const DBRule* singleRule){
	DBG_HELP("LegalityChecker::checkPortRequirements");

	bool bReturn = true;

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];

	const string crewid = crew->idCrew;
	const vector<SharedPtr<ROSTER>>& rosterlist = crew->rosterList;
	const vector<SharedPtr<CREW_QUALIFICATION>>&  quals = crew->qualificationList;

	map<string, vector<DBPortQualReqmnts>> portReqs = this->_dbData->portQualReqmntsAirportMap;

	map<string, vector<DBPortQualReqmnts>>::iterator portmap_iter1, portmap_iter2, portmap_iter3;

	string fleet, base, rank, rosterid, seg_stacode, seg_arrcode, seg_type;
	string seg_fleet, fltNum, airline_port, division_port, crew_group, fltnum_port, seg_type_port;
	string airport, fleet_port, rank_port, qual_port, start_port, end_port, inout;
	int level_port;
	vector<string> rank_port_list;
	vector<string> no_find_port_list;
	vector<string> find_port_list; //反向时，不应该有的list
	vector<string> seg_type_list;
	vector<string> qual_port_list;
	multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> qualExtensionConfigsForQualMap;//multimap<qual,<Activity(扩展资质任务),QualExtensionConfig>>
	for (auto& roster: rosterlist)
	{
		auto tmpQualExtensionConfigsForQualMap = RosterUtils::GetQualExtensionConfigs(roster.get(), this->_dbData->qualExtensionConfigMap);
		qualExtensionConfigsForQualMap.insert(tmpQualExtensionConfigsForQualMap.begin(), tmpQualExtensionConfigsForQualMap.end());

		bool returnToOutterLoop = false;

		if (!roster->needRuleCheck && this->_application == ROSTER_OPTIMIZER){
			//cout << "No need to check rule" << endl;
			continue;
		}
		if (roster->duty != "FLY" && roster->duty != "MVO") continue;
		rosterid = Utility::GetInstancePtr()->llToa(roster->rosterId);
		rank = roster->actingRank;
		if (roster->pairing)
			base = roster->pairing->getBase();
		else
			return true;

		auto iOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);

		bool isFd = (this->_dbData->crewList[pCrew->crewIndex]->division == "P");

		time_t roster_start = roster->actStrUtc;
		time_t roster_end = roster->actRestStrUtc;
		vector<Duty *> dutylist = roster->pairing->getDutyVec();
		for (vector<Duty *>::iterator duty_iter = dutylist.begin(); duty_iter != dutylist.end(); duty_iter++)
		{
			if (returnToOutterLoop)
				break;
			Duty::DUTY_TYPE dt = (*duty_iter)->getType();
			vector<Segment*> fltlist = (*duty_iter)->getSegments();
			for (vector<Segment*>::iterator seg_iter = fltlist.begin(); seg_iter != fltlist.end(); seg_iter++)
			{
				if (returnToOutterLoop)
					break;
				if (!(*seg_iter)->getIsOperating())
					continue;
				const time_t seg_start_utc = (*seg_iter)->getStartTimeUtcAct();
				const time_t seg_end_utc = (*seg_iter)->getEndTimeUtcAct();
				seg_stacode = (*seg_iter)->getDepStation();
				seg_arrcode = (*seg_iter)->getArrStation();
				fltNum = (*seg_iter)->getSegNumber();
				seg_type = (*seg_iter)->getDomIntType();

				portmap_iter1 = portReqs.find(seg_stacode);
				portmap_iter2 = portReqs.find(seg_arrcode);
				portmap_iter3 = portReqs.find("*");
				vector<DBPortQualReqmnts> dbportMatched;

				if (portmap_iter1 != portReqs.end())
					dbportMatched = (*portmap_iter1).second;

				if (portmap_iter2 != portReqs.end())
					dbportMatched.insert(dbportMatched.end(), (*portmap_iter2).second.begin(), (*portmap_iter2).second.end());

				if (portmap_iter3 != portReqs.end())
					dbportMatched.insert(dbportMatched.end(), (*portmap_iter3).second.begin(), (*portmap_iter3).second.end());

				SharedPtr<RosterFlight> rf = this->_dbData->rosterFlightMgr.get((*seg_iter)->getDBId(), roster->idcrew);
				for (vector<DBPortQualReqmnts>::iterator iter_port = dbportMatched.begin(); iter_port != dbportMatched.end(); ++iter_port)
				{
					rank_port_list.clear(); //检查每个条目时，需要清空之前条目的rank_port_list
					seg_type_list.clear();
					qual_port_list.clear();
					
					//op#2169 如果 tsFlag与exceptionCode有重复 不检查
					if (rf != NULL){
						vector <string> v1, v2, v3;
						split(rf->tsFlag, '|', v1);
						split((*iter_port).exceptionCode, '|', v2);
						v3.insert(v3.end(), v1.begin(), v1.end());
						v3.insert(v3.end(), v2.begin(), v2.end());
						//mantis#8635: 8011法规 expceptionCode标记无效
						stable_sort(v3.begin(), v3.end());
						int n = static_cast<int>(unique(v3.begin(), v3.end()) - v3.begin());
						if (n != v3.size() && v1[0] != "" && v2[0] != ""){
							continue;
						}
					}
					if (returnToOutterLoop)
						break;
					airline_port = (*iter_port).airline;
					division_port = (*iter_port).division;
					crew_group = (*iter_port).crewGroup;

					fltnum_port = (*iter_port).fltNum;
					airport = (*iter_port).airport;
					fleet_port = (*iter_port).fleet;
					rank_port = (*iter_port).rank;
					split(rank_port, '|', rank_port_list);
					seg_type_port = (*iter_port).segType;
					split(seg_type_port, '|', seg_type_list);
					qual_port = (*iter_port).qual;
					split(qual_port, '|', qual_port_list);
					level_port = (*iter_port).level;
					const time_t& eff = (*iter_port).effLocal;
					time_t expiry = (*iter_port).expLocal;

					if (expiry < 0){
						expiry = time(NULL) + 2 * 365 * 24 * 60 * 60;
					}

					string acType = "";
					if (_dbData->fleetMap.find((*seg_iter)->getFleetCD()) != _dbData->fleetMap.end()) {
						acType = _dbData->fleetMap[(*seg_iter)->getFleetCD()].acType;
					}

					start_port = (*iter_port).startTime;
					end_port = (*iter_port).endTime;
					inout = (*iter_port).inOutInd;

					if (start_port.length() == 0)
						start_port = "00:00";
					else if (start_port.find(":") == string::npos)
						start_port = start_port.substr(0, 2) + ":" + start_port.substr(3, 2);

					if (end_port.length() == 0)
						end_port = "23:59";
					else if (start_port.find(":") == string::npos)
						end_port = end_port.substr(0, 2) + ":" + end_port.substr(3, 2);

					bool bStartInRange = Utility::GetInstancePtr()->IsTimesInRange(seg_start_utc, iOffsetMinutes, start_port, end_port);
					bool bEndInRange = Utility::GetInstancePtr()->IsTimesInRange(seg_end_utc, iOffsetMinutes, start_port, end_port);
					bool bCrewTeam = Utility::GetInstancePtr()->isCrewTeamQualified(crew, crew_group, seg_start_utc + iOffsetMinutes * 60, seg_end_utc + iOffsetMinutes * 60);

					bool bFoundQual = true;
					if ((isFd && division_port == "P") || ((!isFd) && division_port == "C"))
					{
						if (fltnum_port.length() == 0 || fltnum_port == "*" || fltNum == fltnum_port)
						{
							if (fleet_port.length() == 0 || fleet_port == "*" || fleet_port == ((*seg_iter)->getFleetCD()))
							{
								if (rank_port.length() == 0 || rank_port == "*" || std::find(rank_port_list.begin(), rank_port_list.end(), rank) != rank_port_list.end())
								{
									if (bCrewTeam) {
										if ((eff < seg_start_utc + iOffsetMinutes * 60) && (expiry > seg_end_utc + iOffsetMinutes * 60)) {

											if (((inout == "B") && (seg_stacode == airport || seg_arrcode == airport)) ||
												((inout == "O") && (seg_stacode == airport)) ||
												((inout == "I") && (seg_arrcode == airport)) || airport == "*")
											{
												//crew group not implemented
												if (((inout == "B") && (bStartInRange || bEndInRange)) ||
													((inout == "O") && (bStartInRange)) ||
													((inout == "I") && (bEndInRange)))
												{
													if (seg_type_list.size() == 0 || seg_type_list[0] == ""
														|| find(seg_type_list.begin(), seg_type_list.end(), seg_type) != seg_type_list.end()) {
														bFoundQual = false;
														for (auto& qual : quals)
														{
															// 去除isValid判断
															if (find(qual_port_list.begin(), qual_port_list.end(), qual->qual) != qual_port_list.end())
															{
																// 3.0 新增语言等级验证, 资质增加acType，表示该资质只适用与某个机型
																if (level_port == NULL || qual->languageLevel == 0 || (qual->languageLevel != NULL && qual->languageLevel >= level_port)) {
																	vector<string> ac_type_list;
																	split(qual->acType, '|', ac_type_list);
																	if ((qual->acType).length() == 0 || qual->acType == "*" || find(ac_type_list.begin(), ac_type_list.end(), acType) != ac_type_list.end()) {
																		time_t qual_eff = qual->issuedUtc;
																		time_t qual_expiry = (qual->invaildUtc == utcStrToUtc("9999-12-31") || qual->expiryUtc > qual->invaildUtc) ? qual->expiryUtc : qual->invaildUtc;
																		if (qual_expiry < 0) qual_expiry = time(NULL) + 2 * 365 * 24 * 60 * 60;
																		if (this->_application == ROSTER_OPTIMIZER || (this->_application == ROSTER_EDITOR && this->_dbData->scenario.scenarioId > 0)) {
																			auto qualPeriod = RosterUtils::GetQualExtension(qual, qualExtensionConfigsForQualMap);
																			qual_eff = std::get<0>(qualPeriod);
																			qual_expiry = std::get<1>(qualPeriod);
																		}
																		if ((qual_eff < seg_start_utc) && (qual_expiry > seg_end_utc))
																		{
																			bFoundQual = true;
																		}
																	}
																}
															}
														}
													}
													if (!bFoundQual && !(*iter_port).isRestricted)
													{
														if (std::find(no_find_port_list.begin(), no_find_port_list.end(), qual_port) == no_find_port_list.end())
															no_find_port_list.push_back(qual_port);
													}
													else if (bFoundQual && (*iter_port).isRestricted) {
														if (std::find(find_port_list.begin(), find_port_list.end(), qual_port) == find_port_list.end())
															find_port_list.push_back(qual_port);
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

		if (no_find_port_list.size() > 0) {
			bReturn = false;
			string legalMessage = "Crew " + crewid + ":No valid port qualification(" + joinStrList(no_find_port_list, ",") + ") for pairing(" + Utility::GetInstancePtr()->llToa(roster->pairId) + ")";
			this->setLegalityMessage(roster,pCrew, singleRule, legalMessage);

			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = crewid;
			rv->rosterId =roster->rosterId;
			rv->pairingId = roster->pairId;
			rv->startDTUtc = roster->getStartTimeUtcAct();
			rv->endDTUtc = roster->getEndTimeUtcAct();
			rv->violation_msg = legalMessage;
			rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("crewId", crewid));
			rv->operation_result.insert(pair<string, string>("qual_port", joinStrList(no_find_port_list, ",")));
			rv->operation_result.insert(pair<string, string>("label", roster->label));
			rv->operation_result.insert(pair<string, string>("pairingId", Utility::GetInstancePtr()->llToa(roster->pairId)));
			rv->operation_result.insert(pair<string, string>("isRestricted", "N"));
			this->addRuleViolations(rv, singleRule);

			pCrew->isLegal = false;
			
			no_find_port_list.clear();
		}
		if (find_port_list.size() > 0) {
			bReturn = false;
			string legalMessage = "Crew " + crewid + ":Has port qualification(" + joinStrList(find_port_list, ",") + ") for pairing(" + Utility::GetInstancePtr()->llToa(roster->pairId) + ")";
			this->setLegalityMessage(roster, pCrew, singleRule, legalMessage);

			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = crewid;
			rv->rosterId = roster->rosterId;
			rv->pairingId = roster->pairId;
			rv->startDTUtc = roster->getStartTimeUtcAct();
			rv->endDTUtc = roster->getEndTimeUtcAct();
			rv->violation_msg = legalMessage;
			rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("crewId", crewid));
			rv->operation_result.insert(pair<string, string>("qual_port", joinStrList(find_port_list, ",")));
			rv->operation_result.insert(pair<string, string>("label", roster->label));
			rv->operation_result.insert(pair<string, string>("pairingId", Utility::GetInstancePtr()->llToa(roster->pairId)));
			rv->operation_result.insert(pair<string, string>("isRestricted", "Y"));
			this->addRuleViolations(rv, singleRule);

			pCrew->isLegal = false;

			no_find_port_list.clear();
		}
	}

	return bReturn;
}