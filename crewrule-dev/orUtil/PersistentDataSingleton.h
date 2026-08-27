//
// Created by Yuhao Wang on 2024/12/18.
//

#ifndef PairingOptimizeProject_PERSISTENTDATASINGLETON_H
#define PairingOptimizeProject_PERSISTENTDATASINGLETON_H

#include <map>
#include <set>
#include <string>

class PersistentDataSingleton {
public:
    static PersistentDataSingleton * instance() {
      static PersistentDataSingleton _instance;
	  return &_instance;
    }
	PersistentDataSingleton(const PersistentDataSingleton& p) = delete;
	PersistentDataSingleton& operator= (const PersistentDataSingleton& p) = delete;

	void SetAssignmentGroupSetting(const std::unordered_map<std::string, std::unordered_set<std::string>>& value) {_assignmentGroupSetting = value; }
	[[nodiscard]] const std::unordered_map<std::string, std::unordered_set<std::string>>& GetAssignmentGroupSetting() const { return _assignmentGroupSetting; }

private:
    explicit PersistentDataSingleton() = default;

	std::unordered_map<std::string, std::unordered_set<std::string>> _assignmentGroupSetting;
};



#endif //PairingOptimizeProject_PERSISTENTDATASINGLETON_H
