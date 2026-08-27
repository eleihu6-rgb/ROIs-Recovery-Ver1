//
// Created by haoli on 2025/7/3.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGCOURSE_H
#define TRAININGOPTIMIZER_DBTRAININGCOURSE_H

#include "string"
#include "vector"
#include "unordered_set"
#include "DBTrainingDevice.h"
#include "set"

class DBTrainingCourse {
public:
    enum class Type {
        Line,
        Simulator,
        Ground,
        E_Learning
    };

    DBTrainingCourse(long long id, std::string name, Type type, unsigned int sector) :
            _id(id), _name(std::move(name)), _type(type), _sector(sector) {}

    [[nodiscard]] long long GetId() const { return _id; }

    void SetId(long long id) { _id = id; }

    [[nodiscard]] const std::string &GetName() const { return _name; }

    void SetName(const std::string &name) { _name = name; }

    [[nodiscard]] Type GetType() const { return _type; }

    void SetType(Type type) { _type = type; }

    [[nodiscard]] unsigned int GetSector() const { return _sector; }

    void SetSector(unsigned int sector) { _sector = sector; }

    [[nodiscard]] const std::vector<time_t> &GetMustStartTimes() const {return _mustStartTimes;}
    [[nodiscard]] const std::vector<time_t> &GetSuggestStartTimes() const {return _suggestStartTimes;}
    void SetMustStartTimes(const std::vector<time_t> &mustStartTimes){_mustStartTimes = mustStartTimes;}
    void SetSuggestStartTimes(const std::vector<time_t> &suggestStartTimes){_suggestStartTimes = suggestStartTimes;}

    [[nodiscard]] const std::unordered_set<std::string> &GetMustDevices() const {return _mustDevices;}
    [[nodiscard]] const std::unordered_set<std::string> &GetSuggestDevices() const {return _suggestDevices;}
    void SetMustDevices(const std::unordered_set<std::string> &mustDevices){_mustDevices = mustDevices;}
    void SetSuggestDevices(const std::unordered_set<std::string> &suggestDevices){_suggestDevices = suggestDevices;}

    [[nodiscard]] DBTrainingDevice::Type GetDeviceType() const { return _deviceType; }
    void SetDeviceType(DBTrainingDevice::Type type) { _deviceType = type; }

    [[nodiscard]] const std::set<std::string> &GetProjectQuals() const { return _projectQuals; }
    void SetProjectQuals(const std::set<std::string> &projectQuals) { _projectQuals = projectQuals; }

private:
    long long _id;
    std::string _name;
    Type _type;
    unsigned int _sector;
    std::vector<time_t> _mustStartTimes;
    std::vector<time_t> _suggestStartTimes;
    std::unordered_set<std::string> _mustDevices;
    std::unordered_set<std::string> _suggestDevices;
    DBTrainingDevice::Type _deviceType;
    std::set<std::string> _projectQuals;
};


#endif //TRAININGOPTIMIZER_DBTRAININGCOURSE_H
