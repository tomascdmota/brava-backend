import bcrypt from "bcrypt";
import jwt from 'jsonwebtoken'
import UserModel from "../models/User";
 
interface LoginResponse {
    access_token: string;
    user: {
        id: number;
        username: string;
    }
}

const authService = {
    login: async (username: string, password: string): Promise<LoginResponse> => {
        const user = await UserModel.findByUsername(username);
        
        if(!user) {
            throw new Error("A user with this username doesn't exist");
        }
        const isPasswordCorrect = bcrypt.compare(password, user.password)
        if(!isPasswordCorrect){
            throw new Error("Password incorrect")
        }
        
        const access_token = jwt.sign(
            {username: user.username, id: user.id},
            process.env.JWT_SECRET as string,
            {expiresIn: '30d'}
        );
        await UserModel.updateLastLogin(user.id);

        return {
            access_token, 
            user: {
                id: user.id,
                username: user.username,
            },
        };
    },
};

export default authService