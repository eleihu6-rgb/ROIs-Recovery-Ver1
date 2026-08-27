/**
 * @file SwapCrew.h
 * @author Yuhao Wang
 * @email yuhao.wang(at)pi-solution.com
 * @date 2024-06-27
**/


#ifndef RULEENGINEFRAMEWORK_SWAPCREW_H
#define RULEENGINEFRAMEWORK_SWAPCREW_H

#include <memory>
#include <string>
#include <vector>
#include "CrewDB.h"

class SwapCrew {
public:
    SwapCrew(std::shared_ptr<CREW>& crew); //从crew当前状态初始化swapCrew, beforeRoster=afterRoster=crew->rosterList, addedRoster=removeRoster=[empty]
    std::string crewId;
    std::shared_ptr<CREW> swapCrew;
    std::vector<std::shared_ptr<ROSTER>> beforeRosters;
    std::vector<std::shared_ptr<ROSTER>> afterRosters;
    std::vector<std::shared_ptr<ROSTER>> addedRosters;
    std::vector<std::shared_ptr<ROSTER>> removedRosters;
};

#endif //RULEENGINEFRAMEWORK_SWAPCREW_H
