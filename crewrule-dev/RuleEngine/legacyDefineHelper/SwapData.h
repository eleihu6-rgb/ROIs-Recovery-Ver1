/**
 * @file SwapData.h
 * @author Yuhao Wang
 * @email yuhao.wang(at)pi-solution.com
 * @date 2024-06-27
**/


#ifndef RULEENGINEFRAMEWORK_SWAPDATA_H
#define RULEENGINEFRAMEWORK_SWAPDATA_H

#include <memory>
#include <string>
#include <map>
#include "SwapCrew.h"

//针对swap操作checkRules参数, 内容为beforeRoster/afterRoster/addRoster/removeRoster
class SwapData {
public:
    std::map<std::string, std::shared_ptr<SwapCrew>> swapCrews;
    void print(std::string msg) {
        for (auto& it : swapCrews) {
            cout << msg << " SwapCrew[" << it.first << "]\n";
            auto& swapCrew = it.second;
            for (auto& roster : swapCrew->beforeRosters)
                cout << "    before " << roster->toReadableStr() << "\n";
            for (auto& roster : swapCrew->afterRosters)
                cout << "    after  " << roster->toReadableStr() << "\n";
            for (auto& roster : swapCrew->addedRosters)
                cout << "    add    " << roster->toReadableStr() << "\n";
            for (auto& roster : swapCrew->removedRosters)
                cout << "    remove " << roster->toReadableStr() << "\n";
        }
    }
};


#endif //RULEENGINEFRAMEWORK_SWAPDATA_H
