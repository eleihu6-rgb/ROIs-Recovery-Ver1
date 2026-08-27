/**
 * @file CalculatePICForEvaRule.cpp
 * @brief 计算评估规则中的PIC（机长），重构NormalFlight满足多场景PIC分配规则
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.5
 * @date 2025-02-20
 * @note 核心规则：1. 单Duty与多Duty的PIC分配差异 2. 多Duty的ABA轮换 3. 航段级FCN机组独立计算
**/

#include "../RuleSytem.h"
#include "CalculatePICForEvaRule.h"
#include "../constant/Constants.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"

#include "index/TmProgramIndex.h"
#include "utils/TrainingCourseUtils.h"



// 辅助函数：按资历排序FCN机组
void SortFCNCrews(std::vector<SharedPtr<CREW>>& fcnCrews) {
    std::stable_sort(fcnCrews.begin(), fcnCrews.end(), [](const SharedPtr<CREW>& crewA, const SharedPtr<CREW>& crewB) {
        if (!crewA || !crewB) return false;
        if (crewA->seniority != crewB->seniority)
            return crewA->seniority > crewB->seniority;
        if (crewA->serviceDay != crewB->serviceDay)
            return crewA->serviceDay > crewB->serviceDay;
        if (crewA->idCrew != crewB->idCrew)
            return crewA->idCrew < crewB->idCrew;
        return true;
        });
}

void CalculatePICForEvaRule::Calculate(std::vector<const ROSTER*>& rosters) const {
    if (rosters.empty()) {
        return;
    }

    for (const auto& roster : rosters) {
        if (!roster || !roster->pairing) {
            continue;
        }
        const auto& pairing = roster->pairing;
        this->Calculate(pairing);
    }
}

void CalculatePICForEvaRule::Calculate(const Pairing* pairing) const {
    if (!pairing) {
        return;
    }
    const long long pairingId = pairing->getDbId();

    // 遍历rosterFlight，查找是否手工修改
    bool needCalc = true;
    bool isTraining = false;
    const auto& rfs = this->_dbData->rosterFlightMgr.getByPairingId(pairingId);
    for (const auto& rf : rfs) {
        if (!rf) continue;
        if (!rf->courseCode.empty()) {
            isTraining = true;
        }
        if (!rf->seqOrderSource.empty() && rf->seqOrderSource == "PA") {
            needCalc = false;
            break;
        }
    }
    for (const auto& segment : pairing->getSegmentsRead()) {
        if (!segment) continue;
        const auto& rfs = this->_dbData->rosterFlightMgr.get(segment->getDBId());
        for (const auto& rf : rfs) {
            if (!rf) continue;
            if (!rf->seqOrderSource.empty() && rf->seqOrderSource == "PA") {
                needCalc = false;
                break;
            }
        }
    }

    if (!needCalc) return;

    if (!isTraining) {
        CalculateNormalFlight(pairing);
    }
    else {
        CalculateTrainingFlight(pairing);
    }
}

// 从crewOnFlight获取指定航段+Pairing下的FCN机组（仅FLY任务）
std::vector<SharedPtr<CREW>> CalculatePICForEvaRule::GetFCNCrewsFromCrewOnFlight(
    const long long pairingId,
    const long long segmentId) const {

    std::vector<SharedPtr<CREW>> fcnCrews;
    set<string> fcnCrewIds; // 用于去重，避免同一航段同一Pairing下重复的FCN机组
    // 从crewOnFlight获取当前航段的所有机组
    const auto& crewOnFlight = this->_dbData->crewOnFlt[segmentId];

    for (const auto& crewItem : crewOnFlight) {
        if (!crewItem || !crewItem->crew) continue;

        if (fcnCrewIds.find(crewItem->crew->idCrew) != fcnCrewIds.end()) {
            continue; // 已经添加过该机组，跳过
        }

        if (crewItem->actingRank == "FCN" && crewItem->assignment == "FLY") {
            fcnCrews.push_back(crewItem->crew);
            fcnCrewIds.insert(crewItem->crew->idCrew);
        }
    }

    // 按资历排序
    SortFCNCrews(fcnCrews);

    return fcnCrews;
}

// 获取已有PIC的航段映射
std::unordered_map<long long, std::string> CalculatePICForEvaRule::GetExistingFlightPICMap(const Pairing* pairing) const {
    std::unordered_map<long long, std::string> existingPICMap;
    if (!pairing) return existingPICMap;

    for (const auto& duty : pairing->getDutyVec()) {
        for (const auto& seg : duty->getSegmentsRead()) {
            if (!seg) continue;
            const long long fltId = seg->getDBId();
            auto it = this->_dbData->flightPICMap.find(fltId);
            if (it != this->_dbData->flightPICMap.end() && !it->second.empty()) {
                existingPICMap[fltId] = it->second;
            }
        }
    }

    return existingPICMap;
}

// 计算单个Duty内的PIC顺序
std::vector<std::string> CalculatePICForEvaRule::CalculateDutyPICSequence(
    const DutyContext& dutyCtx,
    const std::vector<long long>& segmentIds,
    const std::unordered_map<long long, std::vector<SharedPtr<CREW>>>& segFCNCrewsMap) const {

    std::vector<std::string> picSequence;
    const int segCount = segmentIds.size();
    const std::string& firstPIC = dutyCtx.firstPIC;

    // 空值防护
    if (firstPIC.empty()) {
        return picSequence;
    }

    // 单Duty和多Duty的内部顺序规则
    for (int i = 0; i < segCount; ++i) {
        std::string pic;
        const auto& fcnCrews = segFCNCrewsMap.at(segmentIds[i]);
        if (fcnCrews.empty()) {
            picSequence.push_back("");
            continue;
        }
        
        // 优先使用已有PIC（若存在）
        auto it = this->_dbData->flightPICMap.find(segmentIds[i]);
        if (it != this->_dbData->flightPICMap.end() && !it->second.empty()) {
            pic = it->second;
            picSequence.push_back(pic);
            continue;
        }
        string secondPIC = "";
        for (const auto& crew : fcnCrews) {
            if (crew->idCrew != firstPIC) {
                secondPIC = crew->idCrew;
                break;
            }
        }
        if (fcnCrews.size() == 1)
            secondPIC = firstPIC;
        

        // 单Duty规则
        if (dutyCtx.totalDuties == 1) {
            switch (segCount) {
            case 1: pic = firstPIC; break;
            case 2: pic = (i == 0) ? firstPIC : secondPIC; break;
            case 3: pic = (i == 1) ? secondPIC : firstPIC; break; // ABA
            case 4: pic = (i < 2) ? firstPIC : secondPIC; break; // AABB
            case 5: pic = (i < 3) ? firstPIC : secondPIC; break; // AAABB
            case 6: pic = (i < 3) ? firstPIC : secondPIC; break; // AAABBB
            default: pic = (i % 2 == 0) ? firstPIC : secondPIC; break; // ABAB...
            }
        }
        // 多Duty规则
        else {
            switch (segCount) {
            case 1: pic = firstPIC; break;
            case 2: pic = (i == 0) ? firstPIC : secondPIC; break; // AB/BA
            case 3: pic = (i < 2) ? firstPIC : secondPIC; break; // AAB/BBA
            case 4: pic = (i < 2) ? firstPIC : secondPIC; break; // AABB/BBAA
            case 5: pic = (i < 3) ? firstPIC : secondPIC; break; // AAABB/BBBAA
            case 6: pic = (i < 3) ? firstPIC : secondPIC; break; // AAABBB/BBBAAA
            default: pic = (i < segCount / 2) ? firstPIC : secondPIC; break;
            }
        }

        // 验证PIC是否在当前航段的FCN机组中，不在则用第一个机组
        bool picValid = false;
        for (const auto& crew : fcnCrews) {
            if (crew->idCrew == pic) {
                picValid = true;
                break;
            }
        }
        if (!picValid) {
            pic = fcnCrews[0]->idCrew;
        }

        picSequence.push_back(pic);
    }

    return picSequence;
}

// 重构后的NormalFlight方法
void CalculatePICForEvaRule::CalculateNormalFlight(const Pairing* pairing) const {
    if (!pairing || pairing->getPrimeActivity() == "SNY") return;
    const long long pairingId = pairing->getDbId();
    const auto& existingPICMap = GetExistingFlightPICMap(pairing);
    const int totalDuties = pairing->getDutyVec().size();

    // 1. 预加载所有航段的FCN机组（按航段ID映射）
    std::unordered_map<long long, std::vector<SharedPtr<CREW>>> segFCNCrewsMap;
    std::vector<std::vector<long long>> dutySegmentIds; // 每个Duty的航段ID列表

    for (const auto& duty : pairing->getDutyVec()) {
        std::vector<long long> segIds;
        for (const auto& seg : duty->getSegmentsRead()) {
            if (!seg) continue;
            const long long segId = seg->getDBId();
            segIds.push_back(segId);
            if (segFCNCrewsMap.find(segId) == segFCNCrewsMap.end()) {
                segFCNCrewsMap[segId] = GetFCNCrewsFromCrewOnFlight(pairingId, segId);
            }
        }
        dutySegmentIds.push_back(segIds);
    }
    string lastDutyFirstSegFCNCrew = "";
    // 2. 遍历每个Duty，计算PIC顺序
    for (int dutyIdx = 0; dutyIdx < totalDuties; ++dutyIdx) {
        const auto& duty = pairing->getDuty(dutyIdx);
        const auto& segIds = dutySegmentIds[dutyIdx];
        if (segIds.empty()) continue;

        // 确定当前Duty的首个和第二个PIC（ABA轮换）
        DutyContext dutyCtx;
        dutyCtx.dutyIndex = dutyIdx;
        dutyCtx.totalDuties = totalDuties;

        // 取第一个航段的FCN机组作为基准（多环场景下航段机组可能不同）
        const auto& baseFCNCrews = segFCNCrewsMap[segIds[0]];
        if (baseFCNCrews.size() >= 1) {
            dutyCtx.firstPIC = baseFCNCrews[0]->idCrew;
            if (lastDutyFirstSegFCNCrew.empty() || baseFCNCrews.size() == 1) {
                lastDutyFirstSegFCNCrew = baseFCNCrews[0]->idCrew;
            }
            else {
                if (dutyIdx != 0) {
                    for (const auto& crew : baseFCNCrews) {
                        if (crew->idCrew != lastDutyFirstSegFCNCrew) {
                            dutyCtx.firstPIC = crew->idCrew;
                            break;
                        }
                    }
                }
            }
        }
        

        // 计算当前Duty的PIC顺序
        auto picSequence = CalculateDutyPICSequence(dutyCtx, segIds, segFCNCrewsMap);

        if (picSequence.empty()) {
            continue;
        }

        // 应用PIC分配结果
        for (int i = 0; i < segIds.size(); ++i) {
            const long long segId = segIds[i];
            const std::string& picCrewId = picSequence[i];

            // 已有PIC则跳过
            if (existingPICMap.find(segId) != existingPICMap.end()) {
                continue;
            }

            const auto& rfs = this->_dbData->rosterFlightMgr.get(segId);
            for (auto& rf : rfs) {

                // 非FLY任务设为非PIC
                if (rf->assignment != "FLY") {
                    this->_dbData->rosterFlightMgr.updateSeqOrder(rf->crewId, rf->fltId, pairingId, 0);
                    continue;
                }

                // 更新PIC标记
                const bool isPIC = (rf->crewId == picCrewId);
                this->_dbData->rosterFlightMgr.updateSeqOrder(rf->crewId, rf->fltId, pairingId, isPIC ? 1 : 0);
                if (isPIC) {
                    this->_dbData->flightPICMap[rf->fltId] = rf->crewId;
                }
            }
        }
    }
}


// 训练任务逻辑（保持不变）
void CalculatePICForEvaRule::CalculateTrainingFlight(const Pairing* pairing) const {
    const auto& rosters = this->_dbData->crewOnPairing[pairing->getDbId()];

    std::vector<std::string> lipCrews;
    for (const auto& roster : rosters) {
        const auto& crewQualifications = roster->crew->qualificationList;
        for (const auto& qual : crewQualifications) {
            if (qual->qual == "LIP") {
                lipCrews.push_back(roster->crewId);
                break;
            }
        }
    }

    for (const auto& roster : rosters) {
        for (const auto& duty : pairing->getDutyVec()) {
            for (const auto& seg : duty->getSegments()) {
                bool lipOnOver = false;
                const auto& rfs = this->_dbData->rosterFlightMgr.get(seg->getDBId());
                for (const auto& rf : rfs) {
                    if (rf->actingRank == "OVER" && find(lipCrews.begin(), lipCrews.end(), rf->crewId) != lipCrews.end())
                        lipOnOver = true;
                }

                for (auto& rf : rfs) {
                    auto it = this->_dbData->flightPICMap.find(rf->fltId);
                    if (it != this->_dbData->flightPICMap.end() && !it->second.empty()) {
                        if (rf->crewId != it->second)
                            this->_dbData->rosterFlightMgr.updateSeqOrder(rf->crewId, rf->fltId, pairing->getDbId(), 0);
                        continue;
                    }

                    bool foundPIC = false;
                    const auto& rosterProgramCourse = this->_dbData->tmProgramCourseIndex->getByRosterId(rf->rosterId, rf->fltId);
                    if (rosterProgramCourse) {
                        const auto& course = TrainingCourseUtils::GetCourseByCourseId(rosterProgramCourse->courseId, this->_dbData);
                        if (course) {
                            //if (course->courseCode == "LIT" || course->courseCode == "LT2" || course->courseCode == "LT3") {
                                if (rosterProgramCourse->role == "IP" && !lipCrews.empty() && find(lipCrews.begin(), lipCrews.end(), rf->crewId) != lipCrews.end() && rf->actingRank != "OVER") {
                                    rf->seqOrder = 1;
                                    this->_dbData->flightPICMap[rf->fltId] = rf->crewId;
                                    this->_dbData->rosterFlightMgr.updateSeqOrder(rf->crewId, rf->fltId, pairing->getDbId(), 1);
                                    foundPIC = true;
                                }
                                if (rosterProgramCourse->role == "TE" && lipOnOver && rf->actingRank != "OVER" && rf->actingRank == "FCN") {
                                    rf->seqOrder = 1;
                                    this->_dbData->flightPICMap[rf->fltId] = rf->crewId;
                                    this->_dbData->rosterFlightMgr.updateSeqOrder(rf->crewId, rf->fltId, pairing->getDbId(), 1);
                                    foundPIC = true;
                                }
                            //}
                        }
                    }

                    const auto& rosterProgramInstructorCourse = this->_dbData->tmProgramCourseInstructorIndex->getByRosterId(rf->rosterId, rf->fltId);
                    if (rosterProgramInstructorCourse) {
                        const auto& course = TrainingCourseUtils::GetCourseByCourseId(rosterProgramInstructorCourse->courseId, this->_dbData);
                        if (course) {
                            //if (course->courseCode == "LIT" || course->courseCode == "LT2" || course->courseCode == "LT3") {
                                if (rosterProgramInstructorCourse->role == "IP" && !lipCrews.empty() && find(lipCrews.begin(), lipCrews.end(), rf->crewId) != lipCrews.end() && rf->actingRank != "OVER") {
                                    rf->seqOrder = 1;
                                    this->_dbData->flightPICMap[rf->fltId] = rf->crewId;
                                    this->_dbData->rosterFlightMgr.updateSeqOrder(rf->crewId, rf->fltId, pairing->getDbId(), 1);
                                    foundPIC = true;
                                }
                                if (rosterProgramInstructorCourse->role == "TE" && lipOnOver && rf->actingRank != "OVER" && rf->actingRank == "FCN") {
                                    rf->seqOrder = 1;
                                    this->_dbData->flightPICMap[rf->fltId] = rf->crewId;
                                    this->_dbData->rosterFlightMgr.updateSeqOrder(rf->crewId, rf->fltId, pairing->getDbId(), 1);
                                    foundPIC = true;
                                }
                            //}
                        }
                    }

                    if (!foundPIC)
                        this->_dbData->rosterFlightMgr.updateSeqOrder(rf->crewId, rf->fltId, pairing->getDbId(), 0);
                }
            }
        }
    }
}

bool CalculatePICForEvaRule::CompareCrew(SharedPtr<CREW> crewA, SharedPtr<CREW> crewB) const {
    return true;
}

void CalculatePICForEvaRule::ParseParam(const InputType& input) {

}