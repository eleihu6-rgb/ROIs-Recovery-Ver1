/**
 * @file RuleLegality.h
 * @author Yuhao Wang
 * @email yuhao.wang(at)pi-solution.com
 * @date 2024-06-27
**/


#ifndef RULEENGINEFRAMEWORK_RULELEGALITY_H
#define RULEENGINEFRAMEWORK_RULELEGALITY_H

#include <memory>
#include <string>
#include <vector>
#include <atomic>
#include "SwapData.h"

//保存rule检查结果和调用入口数据. 假设RO和RULE ENGINE的数据是一致的
struct RULE_LEGALITY{
//struct RULE_LEGALITY{
    int crewIndex=-1;    //optional,crew（包括开始结束时间）和roster二选一, Crew * crewToCheck = _crewCheckRange[crewIndex]
    int PairingIndex = -1;  //optional,roster和strdt,enddt二选一, Roster * crewRoster=crewToCheck->rosters[RosterIndex]
    int RosterIndex = -1;
    //long strDT;     //optional
    //long endDT;     //optional
    bool   isLegal = true; //Default true
    std::vector<std::string> legalMessage;
    bool needCheckQual = false;
    bool skipCheckInLaterIterations = false;

    std::shared_ptr<SwapData> swapData;  //若checkRule针对swap操作则有内容，否则留空, 判断方法 if (SharedPtr){有内容} else {为空}

    std::string toString();

    ///add by ain
    static std::atomic<long long> instanceCount;
    RULE_LEGALITY() { RULE_LEGALITY::instanceCount++; }
    ~RULE_LEGALITY() { RULE_LEGALITY::instanceCount--; }

};

#endif //RULEENGINEFRAMEWORK_RULELEGALITY_H
